// Loads the built dist/index.js the way KoBar does (one classic script run, document.currentScript carrying the id) with
// minimal stand-ins for KoBar's globals, then renders the panel and the settings panel. Run `npm run build` first.
import * as fs from 'node:fs';
import * as path from 'node:path';
import React, { act } from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.js'), 'utf8');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function fakeStore(initial) {
    let state = initial;
    const listeners = new Set();
    const useStore = (selector = (s) => s) => React.useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => selector(state));
    useStore.getState = () => state;
    useStore.setState = (patch) => {
        state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
        listeners.forEach((l) => l());
    };
    useStore.subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
    return useStore;
}

function fakeRegistry() {
    const data = new Map();
    const reg = { buttons: [], panels: new Map(), settings: new Map(), widgets: new Map() };
    return {
        reg,
        registerSidebarButton: (b) => reg.buttons.push(b),
        registerPanel: (id, p) => reg.panels.set(id, p),
        registerSettingsPanel: (id, p) => reg.settings.set(id, p),
        registerInlineWidget: (id, w) => reg.widgets.set(id, w),
        getPanel: (id) => reg.panels.get(id),
        getData: (id, def) => (data.has(id) ? data.get(id) : def),
        setData: (id, value) => data.set(id, value),
    };
}

/** Never connects: every socket closes like a refused connection. */
class RefusedSocket {
    constructor() {
        setTimeout(() => this.onclose?.({ code: 1006 }), 0);
    }
    send() {}
    close() {}
}

let calls;

function runBundle(extensionId) {
    const script = document.createElement('script');
    script.dataset.extensionId = extensionId;
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script });
    try {
        new Function(BUNDLE)();
    } finally {
        delete document.currentScript;
    }
}

beforeEach(() => {
    calls = [];
    delete window.__koTerminal;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.useAppStore = fakeStore({ language: 'en', edgePosition: 'right', activeExtensionPanelId: null, closeAllUtilityPopups: () => calls.push('closeAll'), openPluginsTab: () => calls.push('openPlugins') });
    window.KoBarExtensions = fakeRegistry();
    window.api = { getPlatform: () => 'win32', launchFile: (p) => calls.push(['launch', p]), openExternal: (u) => calls.push(['open', u]) };
    window.WebSocket = RefusedSocket;
});

afterEach(() => {
    delete window.__koTerminal;
});

async function render(element) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(element));
    return { container, root };
}

describe('dist/index.js in a KoBar-like page', () => {
    it('registers button, panel and settings panel under the id from document.currentScript', () => {
        runBundle('com.eedali.koterminal');
        const { reg } = window.KoBarExtensions;
        expect(reg.buttons.map((b) => [b.id, b.icon, b.label])).toEqual([['com.eedali.koterminal', 'terminal', 'Terminal']]);
        expect([...reg.panels.keys()]).toEqual(['com.eedali.koterminal']);
        expect([...reg.settings.keys()]).toEqual(['com.eedali.koterminal']);
        expect(document.getElementById('koterminal-style').textContent).toContain('.xterm');
    });

    it('uses the dev- id in the playground', () => {
        runBundle('dev-com.eedali.koterminal');
        expect([...window.KoBarExtensions.reg.settings.keys()]).toEqual(['dev-com.eedali.koterminal']);
    });

    it('a second run (workspace switch) reuses the session manager and does not duplicate the style', () => {
        runBundle('com.eedali.koterminal');
        const first = window.__koTerminal['com.eedali.koterminal'].manager;
        runBundle('com.eedali.koterminal');
        expect(window.__koTerminal['com.eedali.koterminal'].manager).toBe(first);
        expect(document.querySelectorAll('#koterminal-style')).toHaveLength(1);
    });

    it('the button toggles the panel through the documented store fields', () => {
        runBundle('com.eedali.koterminal');
        const button = window.KoBarExtensions.reg.buttons[0];
        const rect = { top: 0, left: 0, bottom: 10, right: 10, width: 10, height: 10 };
        button.onClick({}, rect);
        expect(window.useAppStore.getState().activeExtensionPanelId).toBe('com.eedali.koterminal');
        expect(window.useAppStore.getState().activeExtensionAnchorRect).toBe(rect);
        button.onClick({}, rect);
        expect(calls.filter((c) => c === 'closeAll')).toHaveLength(2);
    });

    it('without a token the panel shows the setup steps, placed next to a right-edge bar', async () => {
        runBundle('com.eedali.koterminal');
        const panel = window.KoBarExtensions.reg.panels.get('com.eedali.koterminal');
        const { container } = await render(panel.render({ onClose: () => calls.push('close'), anchorRect: null }));
        const root = container.querySelector('.kt-panel');
        expect(root.style.right).toBe('100%');
        expect(root.className).toContain('pointer-events-auto');
        expect(container.textContent).toContain('Connect KoTerminal to its bridge');
        await act(async () => container.querySelector('.kt-btn-primary').click());
        expect(calls).toContain('openPlugins');
        const external = [...container.querySelectorAll('.kt-btn')].find((b) => b.textContent === 'PowerShell');
        await act(async () => external.click());
        expect(calls).toContainEqual(['launch', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']);
    });

    it('with a token but no bridge running it explains how to start it, in Turkish too', async () => {
        runBundle('com.eedali.koterminal');
        window.KoBarExtensions.setData('com.eedali.koterminal', { token: 'x'.repeat(43), launcherPath: 'C:\\KoTerminal\\bridge\\start-hidden.vbs' });
        window.useAppStore.setState({ language: 'tr' });
        const panel = window.KoBarExtensions.reg.panels.get('com.eedali.koterminal');
        const { container } = await render(panel.render({ onClose: () => {}, anchorRect: null }));
        await act(async () => new Promise((r) => setTimeout(r, 10)));
        expect(container.textContent).toContain('KoTerminal köprüsü çalışmıyor');
        expect(container.textContent).toContain('127.0.0.1:47011');
        const start = [...container.querySelectorAll('.kt-btn')].find((b) => b.textContent === 'Köprüyü başlat');
        await act(async () => start.click());
        expect(calls).toContainEqual(['launch', 'C:\\KoTerminal\\bridge\\start-hidden.vbs']);
    });

    it('the settings panel saves the token and validates the port', async () => {
        runBundle('com.eedali.koterminal');
        const settings = window.KoBarExtensions.reg.settings.get('com.eedali.koterminal');
        const { container } = await render(settings.render());
        const setValue = (input, value) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        await act(async () => setValue(container.querySelector('#kt-token'), 'my-pairing-token'));
        expect(window.KoBarExtensions.getData('com.eedali.koterminal').token).toBe('my-pairing-token');
        const port = container.querySelector('#kt-port');
        await act(async () => setValue(port, '80'));
        await act(async () => port.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
        expect(window.KoBarExtensions.getData('com.eedali.koterminal').port).toBe(47011);
        await act(async () => setValue(port, '48000'));
        await act(async () => port.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
        expect(window.KoBarExtensions.getData('com.eedali.koterminal').port).toBe(48000);
    });
});
