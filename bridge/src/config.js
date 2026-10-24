// Bridge configuration: where it lives, and loading or creating it. The token is the only secret; the file is created
// with owner-only permissions on POSIX (Windows keeps it in the user's own %APPDATA%).
import { randomBytes } from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const DEFAULT_PORT = 47011;
export const CONFIG_FILE = 'bridge.json';
const MIN_TOKEN_LENGTH = 32;

/**
 * Folder of the bridge's config file. `KOTERMINAL_CONFIG_DIR` overrides it (tests, portable setups). Windows uses the
 * machine-local %LOCALAPPDATA% (not the roaming profile, which can be synced to other machines).
 */
export function configDir({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
    if (env.KOTERMINAL_CONFIG_DIR) return env.KOTERMINAL_CONFIG_DIR;
    if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'KoTerminal');
    if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'KoTerminal');
    return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'koterminal');
}

export function newToken() {
    return randomBytes(32).toString('base64url');
}

function isValidPort(value) {
    return Number.isInteger(value) && value >= 1024 && value <= 65535;
}

/** Returns a clean config object or throws a readable error for a damaged file. */
export function normaliseConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('bridge.json is not a JSON object.');
    if (typeof raw.token !== 'string' || raw.token.length < MIN_TOKEN_LENGTH) {
        throw new Error('bridge.json has no valid token. Run with --rotate-token to create a new one.');
    }
    const port = raw.port === undefined ? DEFAULT_PORT : raw.port;
    if (!isValidPort(port)) throw new Error('bridge.json has an invalid port (use 1024-65535).');
    const allowedOrigins = Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins.filter((o) => typeof o === 'string') : [];
    const maxSessions = Number.isInteger(raw.maxSessions) && raw.maxSessions > 0 && raw.maxSessions <= 32 ? raw.maxSessions : 8;
    return { token: raw.token, port, allowedOrigins, maxSessions };
}

function writeConfig(file, config, fs) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(config, null, 4) + '\n', { encoding: 'utf8', mode: 0o600 });
    restrict(file, fs);
}

/** POSIX: keep the token file owner-only even if it was created or copied with wider permissions. */
function restrict(file, fs, platform = process.platform) {
    if (platform === 'win32') return;
    try {
        if ((fs.statSync(file).mode & 0o077) !== 0) fs.chmodSync(file, 0o600);
    } catch {
        /* best effort */
    }
}

/**
 * Loads `<dir>/bridge.json`, creating it with a fresh token on first run. `created` tells the caller to show the token.
 * `rotateToken` replaces the token and keeps the other settings.
 */
export function loadOrCreateConfig({ dir = configDir(), fs = nodeFs, rotateToken = false } = {}) {
    const file = path.join(dir, CONFIG_FILE);
    if (!fs.existsSync(file)) {
        const config = { token: newToken(), port: DEFAULT_PORT, allowedOrigins: [], maxSessions: 8 };
        writeConfig(file, config, fs);
        return { config, file, created: true, rotated: false };
    }
    restrict(file, fs);
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new Error(`Cannot read ${file}: it is not valid JSON. Fix or delete it.`);
    }
    if (rotateToken) {
        raw = { ...raw, token: newToken() };
        writeConfig(file, raw, fs);
    }
    return { config: normaliseConfig(raw), file, created: false, rotated: rotateToken };
}
