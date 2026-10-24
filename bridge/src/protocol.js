// Wire protocol (JSON text frames). Version 1.
//
// client -> bridge                               bridge -> client
//   { type: 'auth', token }        (first, <5 s)   { type: 'ready', name, version, protocol, platform, shells, defaultShell }
//   { type: 'open', shell?, cols, rows, cwd? }     { type: 'opened', shell, pid }
//   { type: 'input', data }                        { type: 'output', data }
//   { type: 'resize', cols, rows }                 { type: 'exit', code, signal }
//   { type: 'ping' }                               { type: 'pong' }
//                                                  { type: 'error', code, message }   (then usually a close)
export const PROTOCOL_VERSION = 1;
export const MAX_INPUT_CHARS = 64 * 1024;

export const CLOSE = Object.freeze({
    AUTH_FAILED: 4001,
    AUTH_TIMEOUT: 4002,
    BAD_MESSAGE: 4003,
    TOO_MANY_SESSIONS: 4004,
    SPAWN_FAILED: 4005,
    SHUTDOWN: 4006,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function size(value, fallback) {
    return Number.isFinite(value) ? clamp(Math.round(value), 2, 500) : fallback;
}

/**
 * Parses one client frame. Returns `{ ok: true, message }` or `{ ok: false, reason, fatal }`; never throws. `fatal: false`
 * (input too large) keeps the connection and its shell open; anything else ends the connection.
 */
export function parseClientMessage(text) {
    if (typeof text !== 'string' || text.length > MAX_INPUT_CHARS * 2) return { ok: false, reason: 'frame too large', fatal: false };
    let raw;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, reason: 'not JSON', fatal: true };
    }
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return { ok: false, reason: 'no type', fatal: true };
    switch (raw.type) {
        case 'auth':
            return typeof raw.token === 'string' ? { ok: true, message: { type: 'auth', token: raw.token } } : { ok: false, reason: 'no token', fatal: true };
        case 'open':
            return {
                ok: true,
                message: {
                    type: 'open',
                    shell: typeof raw.shell === 'string' ? raw.shell : undefined,
                    cols: size(raw.cols, 80),
                    rows: size(raw.rows, 24),
                    cwd: typeof raw.cwd === 'string' && raw.cwd.length < 4096 ? raw.cwd : undefined,
                },
            };
        case 'input':
            if (typeof raw.data !== 'string') return { ok: false, reason: 'bad input', fatal: true };
            if (raw.data.length > MAX_INPUT_CHARS) return { ok: false, reason: 'input too large (send it in parts)', fatal: false };
            return { ok: true, message: { type: 'input', data: raw.data } };
        case 'resize':
            return { ok: true, message: { type: 'resize', cols: size(raw.cols, 80), rows: size(raw.rows, 24) } };
        case 'ping':
            return { ok: true, message: { type: 'ping' } };
        default:
            return { ok: false, reason: `unknown type ${String(raw.type).slice(0, 40)}`, fatal: true };
    }
}
