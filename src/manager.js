// Terminal sessions live here, outside React, so they keep running while the panel is closed. One WebSocket to the
// bridge per session (one shell each). Everything platform-specific is injected, so tests drive it with fakes.
import { translate, currentLanguage } from './i18n.js';

const DIM = '\x1b[90m';
const RED = '\x1b[91m';
const RESET = '\x1b[0m';
/** The bridge refuses input frames over 64K characters; large pastes go in pieces. */
export const INPUT_CHUNK = 16 * 1024;

/** Splits text into pieces of at most `size` UTF-16 units without cutting a surrogate pair. */
export function chunkInput(text, size = INPUT_CHUNK) {
    if (text.length <= size) return [text];
    const parts = [];
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + size, text.length);
        const last = text.charCodeAt(end - 1);
        if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
        parts.push(text.slice(start, end));
        start = end;
    }
    return parts;
}

/**
 * @param {object} deps
 * @param {() => object} deps.getConfig                      current plugin settings
 * @param {(config: object, hooks: object) => { term, fit }} deps.createTerminal  xterm factory
 * @param {typeof WebSocket} deps.WebSocketImpl
 * @param {() => boolean} deps.isRegistered                   false once KoBar has unloaded the plugin
 */
export function createManager({
    getConfig,
    createTerminal,
    WebSocketImpl = globalThis.WebSocket,
    isRegistered = () => true,
    timers = { setInterval: globalThis.setInterval.bind(globalThis), clearInterval: globalThis.clearInterval.bind(globalThis) },
    t = (key, vars) => translate(currentLanguage(), key, vars),
}) {
    const listeners = new Set();
    let version = 0;
    let seq = 0;
    let sessions = [];
    let activeId = null;
    let theme = null;
    let watchdog = null;
    let missedChecks = 0;
    /** status: 'unknown' | 'checking' | 'ok' | 'unreachable' | 'auth-failed'; info: the bridge's `ready` message. */
    let connection = { status: 'unknown', info: null };

    const emit = () => {
        version += 1;
        listeners.forEach((listener) => listener());
    };
    const setConnection = (next) => {
        connection = { ...connection, ...next };
        emit();
    };
    const url = (config) => `ws://127.0.0.1:${config.port}/v1/terminal`;

    function shellName(id) {
        return connection.info?.shells?.find((s) => s.id === id)?.name ?? id ?? 'Shell';
    }

    function uniqueTitle(base, self) {
        const taken = sessions.filter((s) => s !== self && s.title.replace(/ \(\d+\)$/, '') === base).length;
        return taken === 0 ? base : `${base} (${taken + 1})`;
    }

    function send(session, message) {
        if (session.ws && session.ws.readyState === 1) session.ws.send(JSON.stringify(message));
    }

    function openShell(session) {
        const config = getConfig();
        send(session, {
            type: 'open',
            shell: session.shellId || config.shell || connection.info?.defaultShell || undefined,
            cols: session.term.cols,
            rows: session.term.rows,
        });
    }

    function connect(session) {
        const config = getConfig();
        session.status = 'connecting';
        session.gotReady = false;
        emit();
        session.term.write(`${DIM}${t('connecting')}${RESET}\r\n`);
        let ws;
        try {
            ws = new WebSocketImpl(url(config));
        } catch {
            session.status = 'failed';
            setConnection({ status: 'unreachable' });
            return;
        }
        session.ws = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: config.token }));
        ws.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            if (session.ws !== ws) return;
            switch (msg.type) {
                case 'ready':
                    session.gotReady = true;
                    setConnection({ status: 'ok', info: msg });
                    openShell(session);
                    break;
                case 'opened':
                    session.status = 'running';
                    session.shellId = msg.shell;
                    session.title = uniqueTitle(shellName(msg.shell), session);
                    emit();
                    break;
                case 'output':
                    session.term.write(msg.data);
                    break;
                case 'exit':
                    session.status = 'exited';
                    session.exitCode = msg.code;
                    session.term.write(`\r\n${DIM}${t('exited', { code: msg.code })}${RESET}\r\n`);
                    emit();
                    break;
                case 'error':
                    if (msg.code === 'auth-failed') setConnection({ status: 'auth-failed' });
                    session.term.write(`\r\n${RED}${msg.message}${RESET}\r\n`);
                    break;
                default:
                    break;
            }
        };
        ws.onclose = (event) => {
            if (session.ws !== ws) return;
            session.ws = null;
            if (session.closedByUser) return;
            if (event?.code === 4001) setConnection({ status: 'auth-failed' });
            else if (!session.gotReady) setConnection({ status: 'unreachable' });
            if (session.status !== 'exited') {
                session.status = 'failed';
                session.term.write(`\r\n${DIM}${t('lost')}${RESET}\r\n`);
            }
            emit();
        };
        ws.onerror = () => {
            /* a close event follows */
        };
    }

    function startWatchdog() {
        if (watchdog) return;
        missedChecks = 0;
        watchdog = timers.setInterval(() => {
            if (isRegistered()) {
                missedChecks = 0;
                return;
            }
            // Two misses in a row: KoBar unloaded or disabled the plugin, so nobody can see these shells any more.
            missedChecks += 1;
            if (missedChecks >= 2) api.disposeAll();
        }, 5000);
    }

    function stopWatchdog() {
        if (!watchdog) return;
        timers.clearInterval(watchdog);
        watchdog = null;
    }

    const api = {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot: () => version,
        get sessions() {
            return sessions;
        },
        get activeId() {
            return activeId;
        },
        get connection() {
            return connection;
        },
        active: () => sessions.find((s) => s.id === activeId) ?? null,

        /** xterm colours from the panel (they come from KoBar's CSS variables). */
        setTheme(next) {
            theme = next;
            for (const s of sessions) s.term.options.theme = next;
        },

        /** Opens a new terminal tab. Returns the session, or null without a pairing token. */
        createSession(shellId) {
            const config = getConfig();
            if (!config.token) {
                setConnection({ status: 'unknown' });
                return null;
            }
            const session = {
                id: ++seq,
                title: shellName(shellId || config.shell || connection.info?.defaultShell) || 'Shell',
                shellId: shellId || '',
                status: 'connecting',
                exitCode: null,
                ws: null,
                opened: false,
                closedByUser: false,
                gotReady: false,
            };
            const { term, fit, element } = createTerminal(config, {
                theme,
                onNewTab: () => api.createSession(),
                onCloseTab: () => api.closeSession(session.id),
            });
            Object.assign(session, { term, fit, element });
            session.title = uniqueTitle(session.title, session);
            term.onData((data) => {
                if (session.status === 'running') {
                    for (const part of chunkInput(data)) send(session, { type: 'input', data: part });
                    return;
                }
                if (data !== '\r') return;
                if (session.status === 'exited' && session.ws) {
                    session.status = 'connecting';
                    term.write('\r\n');
                    openShell(session);
                    emit();
                } else if (session.status === 'failed' || session.status === 'exited') {
                    connect(session);
                }
            });
            term.onResize(({ cols, rows }) => {
                if (session.status === 'running') send(session, { type: 'resize', cols, rows });
            });
            sessions = [...sessions, session];
            activeId = session.id;
            startWatchdog();
            connect(session);
            emit();
            return session;
        },

        closeSession(id) {
            const session = sessions.find((s) => s.id === id);
            if (!session) return;
            session.closedByUser = true;
            try {
                session.ws?.close(1000, 'closed');
            } catch {
                /* already closed */
            }
            session.ws = null;
            try {
                session.term.dispose();
            } catch {
                /* already disposed */
            }
            session.element.remove();
            const index = sessions.indexOf(session);
            sessions = sessions.filter((s) => s !== session);
            if (activeId === id) activeId = (sessions[index] ?? sessions[index - 1] ?? null)?.id ?? null;
            if (sessions.length === 0) stopWatchdog();
            emit();
        },

        activate(id) {
            if (sessions.some((s) => s.id === id)) {
                activeId = id;
                emit();
            }
        },

        /** Puts the active terminal into `container` (opening xterm on first use) and fits it. */
        attach(container) {
            const session = api.active();
            if (!session || !container) return;
            if (session.element.parentNode !== container) {
                for (const child of Array.from(container.children)) child.remove();
                container.appendChild(session.element);
            }
            if (!session.opened) {
                session.term.open(session.element);
                session.opened = true;
            }
            api.fitActive();
            session.term.focus();
        },

        /** Takes the terminals out of the panel when it closes; they keep running. */
        detach(container) {
            if (!container) return;
            for (const child of Array.from(container.children)) child.remove();
        },

        fitActive() {
            const session = api.active();
            if (!session?.opened) return;
            try {
                session.fit.fit();
            } catch {
                /* not visible yet */
            }
        },

        applyConfig(config) {
            for (const s of sessions) {
                s.term.options.fontSize = config.fontSize;
                s.term.options.cursorBlink = config.cursorBlink;
                s.term.options.scrollback = config.scrollback;
            }
            api.fitActive();
        },

        /** Asks the bridge who it is without opening a shell. Resolves `{ status, info }`. */
        checkConnection(config = getConfig()) {
            if (!config.token) return Promise.resolve({ status: 'unknown', info: null });
            setConnection({ status: 'checking' });
            return new Promise((resolve) => {
                let settled = false;
                const done = (result) => {
                    if (settled) return;
                    settled = true;
                    setConnection(result);
                    resolve(result);
                };
                let ws;
                try {
                    ws = new WebSocketImpl(url(config));
                } catch {
                    return done({ status: 'unreachable', info: null });
                }
                ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: config.token }));
                ws.onmessage = (event) => {
                    let msg;
                    try {
                        msg = JSON.parse(event.data);
                    } catch {
                        return;
                    }
                    if (msg.type === 'ready') {
                        done({ status: 'ok', info: msg });
                        ws.close(1000, 'check');
                    } else if (msg.type === 'error' && msg.code === 'auth-failed') {
                        done({ status: 'auth-failed', info: null });
                    }
                };
                ws.onclose = (event) => done({ status: event?.code === 4001 ? 'auth-failed' : 'unreachable', info: null });
                ws.onerror = () => {
                    /* a close event follows */
                };
            });
        },

        disposeAll() {
            for (const s of [...sessions]) api.closeSession(s.id);
            stopWatchdog();
        },
    };
    return api;
}
