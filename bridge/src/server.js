// The bridge: an HTTP server on 127.0.0.1 that accepts WebSocket upgrades on /v1/terminal and runs one shell (pty)
// per authenticated connection. Everything it needs is injected, so tests can use a fake pty.
import * as nodeFs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { WebSocketServer } from 'ws';
import { CLOSE, PROTOCOL_VERSION, parseClientMessage } from './protocol.js';
import { isAllowedHost, isAllowedOrigin, tokensEqual } from './security.js';
import { describeShells, pickShell } from './shells.js';

export const ENDPOINT = '/v1/terminal';
const AUTH_TIMEOUT_MS = 5000;
/** A failed login is answered after this delay (per connection; there is no global lockout). */
const AUTH_FAIL_DELAY_MS = 500;
/** Connections that have not logged in yet; more are refused until some finish. */
const MAX_PENDING = 16;
const MAX_FRAME_BYTES = 256 * 1024;
const CLOSE_GRACE_MS = 1500;
const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 512 * 1024;

function rejectUpgrade(socket, status, text) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
}

/**
 * Windows: when a shell ends by itself, node-pty 1.1.0 closes its sockets but never disposes the conout worker thread
 * (only kill() does), so every `exit` typed in a terminal would leak a thread in the long-running bridge. kill() is no
 * substitute after an exit: it forks a console-list helper that fails for a process that is already gone. Dispose the
 * worker directly; a later node-pty without this field makes it a no-op.
 */
function releaseExitedPty(pty) {
    try {
        pty._agent?._conoutSocketWorker?.dispose?.();
    } catch {
        /* already released */
    }
}

function workingDirectory(requested, fs, home) {
    if (requested && path.isAbsolute(requested)) {
        try {
            if (fs.statSync(requested).isDirectory()) return requested;
        } catch {
            /* fall back to home */
        }
    }
    return home;
}

/**
 * @param {object} deps
 * @param {{ token: string, port: number, allowedOrigins: string[], maxSessions: number }} deps.config
 * @param {Array<{ id: string, name: string, file: string, args: string[] }>} deps.shells
 * @param {(file: string, args: string[], options: object) => import('node-pty').IPty} deps.spawn  node-pty's spawn
 * @param {string} deps.version
 */
export function createBridgeServer({
    config,
    shells,
    spawn,
    version,
    host = '127.0.0.1',
    platform = process.platform,
    env = process.env,
    fs = nodeFs,
    home = os.homedir(),
    logger = console,
    authTimeoutMs = AUTH_TIMEOUT_MS,
    authFailDelayMs = AUTH_FAIL_DELAY_MS,
}) {
    const sessions = new Set();
    let pending = 0;
    const httpServer = http.createServer((_req, res) => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    });
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
    let boundPort = config.port;

    httpServer.on('upgrade', (req, socket, head) => {
        let pathname = '';
        try {
            pathname = new URL(req.url ?? '', 'http://localhost').pathname;
        } catch {
            /* rejected below */
        }
        if (pathname !== ENDPOINT) return rejectUpgrade(socket, 404, 'Not Found');
        if (!isAllowedHost(req.headers.host, boundPort)) return rejectUpgrade(socket, 403, 'Forbidden');
        if (!isAllowedOrigin(req.headers.origin, config.allowedOrigins)) {
            logger.warn?.(`[bridge] refused a connection from origin ${String(req.headers.origin).slice(0, 80)}`);
            return rejectUpgrade(socket, 403, 'Forbidden');
        }
        // Diagnostics for allowedOrigins setups: KOTERMINAL_LOG_ORIGINS=1 prints the Origin of every accepted upgrade.
        if (env.KOTERMINAL_LOG_ORIGINS === '1') logger.info?.(`[bridge] origin ${JSON.stringify(req.headers.origin ?? null)}`);
        if (pending >= MAX_PENDING) return rejectUpgrade(socket, 503, 'Service Unavailable');
        wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws));
    });

    function send(ws, message) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    }

    function handleConnection(ws) {
        const state = { authed: false, failed: false, pty: null, paused: false, drainTimer: null };
        const authTimer = setTimeout(() => ws.close(CLOSE.AUTH_TIMEOUT, 'auth timeout'), authTimeoutMs);
        pending += 1;
        let counted = true;
        const notPending = () => {
            if (counted) pending -= 1;
            counted = false;
        };

        const stopPty = () => {
            clearTimeout(state.drainTimer);
            if (state.pty) {
                const pty = state.pty;
                state.pty = null;
                sessions.delete(pty);
                try {
                    pty.kill();
                } catch {
                    /* already gone */
                }
            }
        };

        const resumeWhenDrained = () => {
            state.drainTimer = setTimeout(() => {
                if (!state.pty) return;
                if (ws.bufferedAmount <= LOW_WATER) {
                    state.paused = false;
                    state.pty.resume();
                } else {
                    resumeWhenDrained();
                }
            }, 50);
        };

        const openShell = ({ shell: shellId, cols, rows, cwd }) => {
            if (state.pty) return send(ws, { type: 'error', code: 'already-open', message: 'A shell is already running on this connection.' });
            if (sessions.size >= config.maxSessions) {
                send(ws, { type: 'error', code: 'too-many-sessions', message: `At most ${config.maxSessions} terminals at once.` });
                return ws.close(CLOSE.TOO_MANY_SESSIONS, 'too many sessions');
            }
            const shell = pickShell(shells, shellId);
            if (!shell) {
                send(ws, { type: 'error', code: 'no-shell', message: 'No shell was found on this system.' });
                return ws.close(CLOSE.SPAWN_FAILED, 'no shell');
            }
            let pty;
            try {
                pty = spawn(shell.file, shell.args, {
                    name: 'xterm-256color',
                    cols,
                    rows,
                    cwd: workingDirectory(cwd, fs, home),
                    env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'KoTerminal' },
                    // Windows: the system ConPTY on purpose. node-pty 1.1.0's bundled ConPTY (useConptyDll) leaks one
                    // worker thread per closed terminal. The system one forks a helper on kill that prints a harmless
                    // "AttachConsole failed" when the bridge has no console of its own (e.g. under Git Bash).
                });
            } catch (err) {
                send(ws, { type: 'error', code: 'spawn-failed', message: `Could not start ${shell.name}: ${err?.message ?? err}` });
                return;
            }
            state.pty = pty;
            sessions.add(pty);
            pty.onData((data) => {
                if (state.pty !== pty) return;
                send(ws, { type: 'output', data });
                if (!state.paused && ws.bufferedAmount > HIGH_WATER) {
                    state.paused = true;
                    pty.pause();
                    resumeWhenDrained();
                }
            });
            pty.onExit(({ exitCode, signal }) => {
                if (state.pty !== pty) return;
                sessions.delete(pty);
                state.pty = null;
                clearTimeout(state.drainTimer);
                if (platform === 'win32') releaseExitedPty(pty);
                send(ws, { type: 'exit', code: exitCode, signal: signal ?? null });
            });
            send(ws, { type: 'opened', shell: shell.id, pid: pty.pid });
        };

        ws.on('message', (data, isBinary) => {
            if (state.failed) return;
            const parsed = isBinary ? { ok: false, reason: 'binary frame', fatal: true } : parseClientMessage(data.toString('utf8'));
            if (!parsed.ok) {
                if (state.authed && !parsed.fatal) return send(ws, { type: 'error', code: 'input-too-large', message: parsed.reason });
                send(ws, { type: 'error', code: 'bad-message', message: parsed.reason });
                return ws.close(CLOSE.BAD_MESSAGE, 'bad message');
            }
            const message = parsed.message;
            if (!state.authed) {
                if (message.type !== 'auth' || !tokensEqual(message.token, config.token)) {
                    state.failed = true;
                    clearTimeout(authTimer);
                    // Answered late on purpose (per connection). No global lockout: it would let anyone lock the user out.
                    setTimeout(() => {
                        send(ws, { type: 'error', code: 'auth-failed', message: 'Wrong or missing pairing token.' });
                        ws.close(CLOSE.AUTH_FAILED, 'auth failed');
                    }, authFailDelayMs);
                    return;
                }
                state.authed = true;
                notPending();
                clearTimeout(authTimer);
                return send(ws, {
                    type: 'ready',
                    name: 'koterminal-bridge',
                    version,
                    protocol: PROTOCOL_VERSION,
                    platform,
                    shells: describeShells(shells),
                    defaultShell: shells[0]?.id ?? null,
                });
            }
            switch (message.type) {
                case 'open':
                    return openShell(message);
                case 'input':
                    return state.pty?.write(message.data);
                case 'resize':
                    try {
                        state.pty?.resize(message.cols, message.rows);
                    } catch {
                        /* the pty may have just exited */
                    }
                    return;
                case 'ping':
                    return send(ws, { type: 'pong' });
                default:
                    return send(ws, { type: 'error', code: 'unexpected', message: `Unexpected ${message.type}.` });
            }
        });

        ws.on('close', () => {
            clearTimeout(authTimer);
            notPending();
            stopPty();
        });
        ws.on('error', () => stopPty());
    }

    return {
        /** Starts listening; resolves with the bound port (use port 0 in tests for a free one). */
        listen(port = config.port) {
            return new Promise((resolve, reject) => {
                httpServer.once('error', reject);
                httpServer.listen(port, host, () => {
                    httpServer.off('error', reject);
                    boundPort = httpServer.address().port;
                    resolve(boundPort);
                });
            });
        },
        /** Kills every shell, closes every connection and stops listening. */
        close() {
            for (const pty of sessions) {
                try {
                    pty.kill();
                } catch {
                    /* already gone */
                }
            }
            sessions.clear();
            for (const client of wss.clients) client.close(CLOSE.SHUTDOWN, 'bridge stopped');
            // A client that does not answer the close handshake is cut off instead of holding the shutdown for 30 s.
            setTimeout(() => {
                for (const client of wss.clients) client.terminate();
            }, CLOSE_GRACE_MS).unref?.();
            return new Promise((resolve) => {
                wss.close();
                httpServer.close(() => resolve());
                httpServer.closeAllConnections?.();
            });
        },
        sessionCount: () => sessions.size,
    };
}
