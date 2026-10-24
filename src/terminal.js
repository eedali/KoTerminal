// xterm.js factory and the colours it uses. Copy goes through navigator.clipboard.writeText (the one clipboard
// permission KoBar grants), falling back to window.api.writeToClipboard; paste is the browser's own paste event.
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';

export const FONT_FAMILY = '"Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace';

/** xterm theme from the panel's resolved KoBar CSS variables (v1 plugin UI always resolves the dark scheme). */
export function readTheme(element) {
    const style = element ? getComputedStyle(element) : null;
    const css = (name, fallback) => style?.getPropertyValue(name).trim() || fallback;
    const accent = css('--theme-primary', '#f4a125');
    return {
        background: css('--theme-bg-dark', '#1f1f1f'),
        foreground: '#e8e8e8',
        cursor: accent,
        cursorAccent: '#141414',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
    };
}

function copy(text) {
    if (!text) return;
    const fallback = () => window.api?.writeToClipboard?.({ type: 'text', content: text });
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
}

export function createXterm(config, { theme, onNewTab, onCloseTab }) {
    const element = document.createElement('div');
    element.className = 'kt-term';
    const term = new Terminal({
        fontFamily: FONT_FAMILY,
        fontSize: config.fontSize,
        cursorBlink: config.cursorBlink,
        scrollback: config.scrollback,
        theme: theme ?? undefined,
        allowProposedApi: false,
        macOptionIsMeta: true,
        rightClickSelectsWord: false,
        // OSC 8 hyperlinks printed by programs: only http(s), and only through KoBar's checked openExternal.
        linkHandler: {
            activate: (_event, uri) => {
                if (/^https?:\/\//i.test(uri)) window.api?.openExternal?.(uri);
            },
            allowNonHttpProtocols: false,
        },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown') return true;
        const mod = event.ctrlKey || event.metaKey;
        if (!mod) return true;
        if (event.shiftKey && event.code === 'KeyT') {
            onNewTab();
            return false;
        }
        if (event.shiftKey && event.code === 'KeyW') {
            onCloseTab();
            return false;
        }
        // Ctrl+Shift+C always copies; plain Ctrl+C copies only when text is selected (otherwise it is SIGINT).
        if (event.code === 'KeyC' && (event.shiftKey || (term.hasSelection() && !event.altKey))) {
            copy(term.getSelection());
            term.clearSelection();
            return false;
        }
        // Ctrl+V / Ctrl+Shift+V: let the browser fire its paste event, which xterm turns into input.
        if (event.code === 'KeyV') return false;
        return true;
    });
    return { term, fit, element };
}
