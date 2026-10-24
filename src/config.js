// Plugin settings, stored with KoBarExtensions.getData/setData under the plugin id (workspace-aware, persisted in
// KoBar's store, included in its backups).
import { PLUGIN_ID } from './id.js';

export const DEFAULTS = Object.freeze({
    port: 47011,
    token: '',
    shell: '',
    fontSize: 13,
    size: 'm',
    cursorBlink: true,
    scrollback: 5000,
    launcherPath: '',
});

export const PANEL_SIZES = Object.freeze({ s: { width: 520, height: 320 }, m: { width: 680, height: 420 }, l: { width: 880, height: 540 } });

const int = (value, min, max, fallback) => (Number.isInteger(value) && value >= min && value <= max ? value : fallback);

export function sanitizeConfig(raw) {
    const c = raw && typeof raw === 'object' ? raw : {};
    return {
        port: int(Number(c.port), 1024, 65535, DEFAULTS.port),
        token: typeof c.token === 'string' ? c.token.trim().slice(0, 512) : '',
        shell: typeof c.shell === 'string' ? c.shell.slice(0, 64) : '',
        fontSize: int(Number(c.fontSize), 9, 28, DEFAULTS.fontSize),
        size: Object.prototype.hasOwnProperty.call(PANEL_SIZES, c.size) ? c.size : DEFAULTS.size,
        cursorBlink: typeof c.cursorBlink === 'boolean' ? c.cursorBlink : DEFAULTS.cursorBlink,
        scrollback: int(Number(c.scrollback), 500, 50000, DEFAULTS.scrollback),
        launcherPath: typeof c.launcherPath === 'string' ? c.launcherPath.slice(0, 1024) : '',
    };
}

export function readConfig() {
    return sanitizeConfig({ ...DEFAULTS, ...(window.KoBarExtensions?.getData?.(PLUGIN_ID, {}) ?? {}) });
}

export function writeConfig(patch) {
    const next = sanitizeConfig({ ...readConfig(), ...patch });
    window.KoBarExtensions.setData(PLUGIN_ID, next);
    return next;
}
