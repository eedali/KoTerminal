import { beforeEach, describe, expect, it } from 'vitest';
import { INPUT_CHUNK, chunkInput, createManager } from '../src/manager.js';

/** A scripted stand-in for the browser WebSocket. */
class FakeSocket {
    static all = [];
    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.sent = [];
        this.closed = null;
        FakeSocket.all.push(this);
    }
    send(text) {
        this.sent.push(JSON.parse(text));
    }
    close(code = 1000) {
        this.closed = code;
        this.readyState = 3;
    }
    // test helpers
    open() {
        this.readyState = 1;
        this.onopen?.();
    }
    receive(message) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
    drop(code = 1006) {
        this.readyState = 3;
        this.onclose?.({ code });
    }
}

function fakeTerminal() {
    const listeners = { data: [], resize: [] };
    const term = {
        cols: 90,
        rows: 25,
        written: [],
        options: {},
        disposed: false,
        opened: null,
        focused: 0,
        write: (d) => term.written.push(d),
        onData: (fn) => listeners.data.push(fn),
        onResize: (fn) => listeners.resize.push(fn),
        open: (el) => {
            term.opened = el;
        },
        focus: () => {
            term.focused += 1;
        },
        dispose: () => {
            term.disposed = true;
        },
        type: (d) => listeners.data.forEach((fn) => fn(d)),
        resize: (cols, rows) => listeners.resize.forEach((fn) => fn({ cols, rows })),
    };
    return term;
}

let config;
let terminals;
let registered;
let interval;

function setup() {
    terminals = [];
    return createManager({
        getConfig: () => config,
        createTerminal: () => {
            const term = fakeTerminal();
            terminals.push(term);
            return { term, fit: { fit: () => {} }, element: document.createElement('div') };
        },
        WebSocketImpl: FakeSocket,
        isRegistered: () => registered,
        timers: {
            setInterval: (fn) => {
                interval = fn;
                return 1;
            },
            clearInterval: () => {
                interval = null;
            },
        },
        t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    });
}

const READY = { type: 'ready', version: '1.0.0', protocol: 1, platform: 'win32', shells: [{ id: 'pwsh', name: 'PowerShell 7' }, { id: 'cmd', name: 'Command Prompt' }], defaultShell: 'pwsh' };

beforeEach(() => {
    FakeSocket.all = [];
    config = { port: 47011, token: 'secret-token', shell: '', fontSize: 13, cursorBlink: true, scrollback: 5000 };
    registered = true;
    interval = null;
});

describe('session manager', () => {
    it('does nothing without a pairing token', () => {
        config.token = '';
        const manager = setup();
        expect(manager.createSession()).toBeNull();
        expect(FakeSocket.all).toHaveLength(0);
    });

    it('logs in, opens the shell with the terminal size, and relays input, output, resize and exit', () => {
        const manager = setup();
        const session = manager.createSession();
        const ws = FakeSocket.all[0];
        expect(ws.url).toBe('ws://127.0.0.1:47011/v1/terminal');
        ws.open();
        expect(ws.sent[0]).toEqual({ type: 'auth', token: 'secret-token' });
        ws.receive(READY);
        expect(manager.connection.status).toBe('ok');
        expect(ws.sent[1]).toEqual({ type: 'open', shell: 'pwsh', cols: 90, rows: 25 });
        ws.receive({ type: 'opened', shell: 'pwsh', pid: 1 });
        expect(session.status).toBe('running');
        expect(session.title).toBe('PowerShell 7');

        const term = terminals[0];
        term.type('dir\r');
        term.resize(120, 40);
        expect(ws.sent.slice(2)).toEqual([
            { type: 'input', data: 'dir\r' },
            { type: 'resize', cols: 120, rows: 40 },
        ]);
        ws.receive({ type: 'output', data: 'hello' });
        expect(term.written).toContain('hello');

        ws.receive({ type: 'exit', code: 0 });
        expect(session.status).toBe('exited');
        term.type('\r');
        expect(ws.sent.at(-1)).toMatchObject({ type: 'open' });
    });

    it('uses the shell chosen for the tab, then the configured default', () => {
        const manager = setup();
        manager.createSession('cmd');
        let ws = FakeSocket.all[0];
        ws.open();
        ws.receive(READY);
        expect(ws.sent[1].shell).toBe('cmd');
        config.shell = 'pwsh';
        manager.createSession();
        ws = FakeSocket.all[1];
        ws.open();
        ws.receive(READY);
        expect(ws.sent[1].shell).toBe('pwsh');
    });

    it('reports a bridge that is not running and reconnects on Enter', () => {
        const manager = setup();
        const session = manager.createSession();
        FakeSocket.all[0].drop(1006);
        expect(manager.connection.status).toBe('unreachable');
        expect(session.status).toBe('failed');
        terminals[0].type('\r');
        expect(FakeSocket.all).toHaveLength(2);
    });

    it('reports a rejected token', () => {
        const manager = setup();
        manager.createSession();
        const ws = FakeSocket.all[0];
        ws.open();
        ws.receive({ type: 'error', code: 'auth-failed', message: 'Wrong or missing pairing token.' });
        ws.drop(4001);
        expect(manager.connection.status).toBe('auth-failed');
    });

    it('closing a tab closes its socket, disposes xterm and activates a neighbour', () => {
        const manager = setup();
        const a = manager.createSession();
        const b = manager.createSession();
        expect(manager.activeId).toBe(b.id);
        manager.closeSession(b.id);
        expect(FakeSocket.all[1].closed).toBe(1000);
        expect(terminals[1].disposed).toBe(true);
        expect(manager.activeId).toBe(a.id);
        expect(manager.sessions).toHaveLength(1);
    });

    it('attaches the active terminal into the panel once and detaches it on close', () => {
        const manager = setup();
        manager.createSession();
        const container = document.createElement('div');
        manager.attach(container);
        manager.attach(container);
        expect(container.children).toHaveLength(1);
        expect(terminals[0].opened).toBe(container.children[0]);
        manager.detach(container);
        expect(container.children).toHaveLength(0);
    });

    it('closes every terminal when KoBar no longer has the plugin registered (disabled or uninstalled)', () => {
        const manager = setup();
        manager.createSession();
        manager.createSession();
        registered = false;
        interval();
        expect(manager.sessions).toHaveLength(2);
        interval();
        expect(manager.sessions).toHaveLength(0);
        expect(FakeSocket.all.every((ws) => ws.closed === 1000)).toBe(true);
    });

    it('checks the connection without opening a shell', async () => {
        const manager = setup();
        const pending = manager.checkConnection();
        const ws = FakeSocket.all[0];
        ws.open();
        ws.receive(READY);
        const result = await pending;
        expect(result.status).toBe('ok');
        expect(result.info.defaultShell).toBe('pwsh');
        expect(ws.sent).toEqual([{ type: 'auth', token: 'secret-token' }]);
        expect(ws.closed).toBe(1000);
    });

    it('sends a large paste in pieces the bridge accepts, without splitting emoji', () => {
        const manager = setup();
        manager.createSession();
        const ws = FakeSocket.all[0];
        ws.open();
        ws.receive(READY);
        ws.receive({ type: 'opened', shell: 'pwsh', pid: 1 });
        const paste = 'a'.repeat(INPUT_CHUNK - 1) + '😀' + 'b'.repeat(40000);
        terminals[0].type(paste);
        const parts = ws.sent.filter((m) => m.type === 'input').map((m) => m.data);
        expect(parts.join('')).toBe(paste);
        expect(parts.every((p) => p.length <= INPUT_CHUNK)).toBe(true);
        expect(parts[0].endsWith('a')).toBe(true);
        expect(chunkInput('short')).toEqual(['short']);
    });

    it('applies new font and scrollback settings to open terminals', () => {
        const manager = setup();
        manager.createSession();
        manager.applyConfig({ fontSize: 16, cursorBlink: false, scrollback: 20000 });
        expect(terminals[0].options).toEqual({ fontSize: 16, cursorBlink: false, scrollback: 20000 });
    });
});
