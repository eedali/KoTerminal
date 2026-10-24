import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { CLOSE } from '../src/protocol.js';
import { ENDPOINT, createBridgeServer } from '../src/server.js';
import { detectShells } from '../src/shells.js';

const TOKEN = 'test-token-0123456789-0123456789-0123456789';
const quiet = { warn() {}, info() {} };

/** A fake node-pty: records writes/resizes and lets the test emit output and exit. */
function fakeSpawner() {
    const spawned = [];
    const spawn = (file, args, options) => {
        const listeners = { data: [], exit: [] };
        const pty = {
            file,
            args,
            options,
            pid: 4242 + spawned.length,
            written: [],
            resized: [],
            killed: false,
            write: (d) => pty.written.push(d),
            resize: (c, r) => pty.resized.push([c, r]),
            kill: () => {
                pty.killed = true;
            },
            pause() {},
            resume() {},
            onData: (fn) => listeners.data.push(fn),
            onExit: (fn) => listeners.exit.push(fn),
            emitData: (d) => listeners.data.forEach((fn) => fn(d)),
            emitExit: (code) => listeners.exit.forEach((fn) => fn({ exitCode: code })),
        };
        spawned.push(pty);
        return pty;
    };
    return { spawn, spawned };
}

const SHELLS = [
    { id: 'sh1', name: 'Shell One', file: '/bin/one', args: ['-l'] },
    { id: 'sh2', name: 'Shell Two', file: '/bin/two', args: [] },
];

function connect(port, { origin = 'file://', host, path = ENDPOINT } = {}) {
    const headers = {};
    if (host) headers.host = host;
    return new WebSocket(`ws://127.0.0.1:${port}${path}`, { origin, headers });
}

/** Collects messages; `next(type)` resolves with the next message of that type. */
function inbox(ws) {
    const queue = [];
    const waiters = [];
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        const i = waiters.findIndex((w) => w.type === msg.type);
        if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
        else queue.push(msg);
    });
    return {
        next(type) {
            const i = queue.findIndex((m) => m.type === type);
            if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
            return new Promise((resolve) => waiters.push({ type, resolve }));
        },
    };
}

const closed = (ws) => new Promise((resolve) => ws.on('close', (code) => resolve(code)));
const rejected = (ws) =>
    new Promise((resolve) => {
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
        ws.on('error', () => {});
    });

describe('bridge server (fake pty)', () => {
    const fake = fakeSpawner();
    let bridge;
    let port;

    before(async () => {
        bridge = createBridgeServer({
            config: { token: TOKEN, port: 0, allowedOrigins: [], maxSessions: 2 },
            shells: SHELLS,
            spawn: fake.spawn,
            version: '9.9.9',
            platform: 'test',
            logger: quiet,
            authTimeoutMs: 300,
            authFailDelayMs: 20,
        });
        port = await bridge.listen(0);
    });
    after(() => bridge.close());

    it('refuses other paths, foreign hosts, web origins and sandboxed (null) origins before any login', async () => {
        assert.equal(await rejected(connect(port, { path: '/other' })), 404);
        assert.equal(await rejected(connect(port, { host: `evil.example:${port}` })), 403);
        assert.equal(await rejected(connect(port, { origin: 'https://evil.example' })), 403);
        assert.equal(await rejected(connect(port, { origin: 'null' })), 403);
        assert.equal(await rejected(connect(port, { origin: 'http://localhost:5173' })), 403);
    });

    it('many wrong tokens never lock out the right one', async () => {
        const wrong = async () => {
            const ws = connect(port);
            await new Promise((r) => ws.on('open', r));
            ws.send(JSON.stringify({ type: 'auth', token: 'guess' }));
            return closed(ws);
        };
        const codes = await Promise.all(Array.from({ length: 12 }, wrong));
        assert.ok(codes.every((c) => c === CLOSE.AUTH_FAILED));
        const ws = connect(port);
        const box = inbox(ws);
        await new Promise((r) => ws.on('open', r));
        ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
        assert.equal((await box.next('ready')).type, 'ready');
        ws.close();
    });

    it('limits connections that have not logged in yet', async () => {
        const idle = await Promise.all(
            Array.from({ length: 16 }, async () => {
                const ws = connect(port);
                await new Promise((r) => ws.on('open', r));
                return ws;
            })
        );
        assert.equal(await rejected(connect(port)), 503);
        idle.forEach((ws) => ws.close());
        await Promise.all(idle.map(closed));
    });

    it('closes a connection that sends a wrong token', async () => {
        const ws = connect(port);
        const box = inbox(ws);
        await new Promise((r) => ws.on('open', r));
        ws.send(JSON.stringify({ type: 'auth', token: 'wrong' }));
        assert.equal((await box.next('error')).code, 'auth-failed');
        assert.equal(await closed(ws), CLOSE.AUTH_FAILED);
    });

    it('closes a connection that never logs in', async () => {
        const ws = connect(port);
        assert.equal(await closed(ws), CLOSE.AUTH_TIMEOUT);
    });

    it('logs in, opens the chosen shell, relays input, output, resize and exit, and kills the pty on close', async () => {
        const ws = connect(port);
        const box = inbox(ws);
        await new Promise((r) => ws.on('open', r));
        ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
        const ready = await box.next('ready');
        assert.deepEqual(
            { version: ready.version, protocol: ready.protocol, platform: ready.platform, defaultShell: ready.defaultShell },
            { version: '9.9.9', protocol: 1, platform: 'test', defaultShell: 'sh1' }
        );
        assert.deepEqual(ready.shells, [
            { id: 'sh1', name: 'Shell One' },
            { id: 'sh2', name: 'Shell Two' },
        ]);
        assert.equal(JSON.stringify(ready).includes('/bin/'), false, 'paths stay private');

        ws.send(JSON.stringify({ type: 'open', shell: 'sh2', cols: 100, rows: 30 }));
        const opened = await box.next('opened');
        const pty = fake.spawned.at(-1);
        assert.equal(opened.shell, 'sh2');
        assert.equal(pty.file, '/bin/two');
        assert.equal(pty.options.cols, 100);
        assert.equal(pty.options.env.TERM, 'xterm-256color');

        ws.send(JSON.stringify({ type: 'input', data: 'echo hi\r' }));
        ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
        // An oversized paste is refused, but the shell and the connection stay.
        ws.send(JSON.stringify({ type: 'input', data: 'x'.repeat(70000) }));
        assert.equal((await box.next('error')).code, 'input-too-large');
        ws.send(JSON.stringify({ type: 'ping' }));
        await box.next('pong');
        assert.equal(pty.killed, false);
        assert.deepEqual(pty.written, ['echo hi\r']);
        assert.deepEqual(pty.resized, [[120, 40]]);

        pty.emitData('hi\r\n');
        assert.equal((await box.next('output')).data, 'hi\r\n');
        pty.emitExit(3);
        assert.equal((await box.next('exit')).code, 3);
        assert.equal(bridge.sessionCount(), 0);

        // A new shell can be opened on the same connection after an exit.
        ws.send(JSON.stringify({ type: 'open' }));
        assert.equal((await box.next('opened')).shell, 'sh1');
        const second = fake.spawned.at(-1);
        ws.close();
        await closed(ws);
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(second.killed, true);
        assert.equal(bridge.sessionCount(), 0);
    });

    it('limits the number of terminals', async () => {
        const open = async () => {
            const ws = connect(port);
            const box = inbox(ws);
            await new Promise((r) => ws.on('open', r));
            ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
            await box.next('ready');
            ws.send(JSON.stringify({ type: 'open' }));
            return { ws, box };
        };
        const a = await open();
        await a.box.next('opened');
        const b = await open();
        await b.box.next('opened');
        const c = await open();
        assert.equal((await c.box.next('error')).code, 'too-many-sessions');
        assert.equal(await closed(c.ws), CLOSE.TOO_MANY_SESSIONS);
        a.ws.close();
        b.ws.close();
    });

    it('rejects unknown message types (no command execution outside the shell)', async () => {
        const ws = connect(port);
        const box = inbox(ws);
        await new Promise((r) => ws.on('open', r));
        ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
        await box.next('ready');
        ws.send(JSON.stringify({ type: 'exec', command: 'calc.exe' }));
        assert.equal((await box.next('error')).code, 'bad-message');
        assert.equal(await closed(ws), CLOSE.BAD_MESSAGE);
    });
});

describe('bridge server (real shell)', () => {
    it('runs the default shell of this system end to end', async () => {
        const { spawn } = await import('node-pty');
        const shells = detectShells();
        assert.ok(shells.length > 0, 'a shell exists');
        const bridge = createBridgeServer({ config: { token: TOKEN, port: 0, allowedOrigins: [], maxSessions: 2 }, shells, spawn, version: 't', logger: quiet });
        const port = await bridge.listen(0);
        try {
            const ws = connect(port, { origin: undefined });
            const box = inbox(ws);
            await new Promise((r) => ws.on('open', r));
            ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
            await box.next('ready');
            ws.send(JSON.stringify({ type: 'open', cols: 100, rows: 30 }));
            await box.next('opened');
            let output = '';
            const marker = 'KOTERMINAL_' + 'E2E_OK';
            const seen = new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('no echo, got: ' + JSON.stringify(output.slice(-400)))), 20000);
                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'output') output += msg.data;
                    // Split marker so the echoed command line itself does not match.
                    if (output.includes(marker)) {
                        clearTimeout(timer);
                        resolve();
                    }
                });
            });
            setTimeout(() => ws.send(JSON.stringify({ type: 'input', data: `echo KOTERMINAL_""E2E_OK\r` })), 1500);
            await seen;
            ws.close();
            await closed(ws);
        } finally {
            await bridge.close();
        }
    });
});
