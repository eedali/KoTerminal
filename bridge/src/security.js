// Who may talk to the bridge. The bridge runs shells, so every check here fails closed. The pairing token is the real
// barrier; Host and Origin checks are extra layers.
//
// - Host: only `127.0.0.1:<port>` / `localhost:<port>` (stops DNS-rebinding pages that resolve a name to 127.0.0.1).
// - Origin: browsers always send one for WebSockets and pages cannot fake it. A packaged KoBar sends `file://`. Every
//   other origin is refused unless listed in bridge.json `allowedOrigins` (e.g. `http://localhost:5173` for a KoBar
//   development build). A missing Origin means a local non-browser client, which still needs the token.
// - Token: 32 random bytes, compared in constant time. There is no global lockout: anything that can reach the port could
//   otherwise lock the real user out, and a 256-bit token cannot be guessed. Each failed login is delayed instead.
import { createHash, timingSafeEqual } from 'node:crypto';

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze(['file://']);
export const DEV_ORIGIN = 'http://localhost:5173';

export function isAllowedHost(hostHeader, port) {
    if (typeof hostHeader !== 'string') return false;
    const host = hostHeader.trim().toLowerCase();
    return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function isAllowedOrigin(origin, extra = []) {
    if (origin === undefined) return true;
    if (typeof origin !== 'string') return false;
    const value = origin.trim().toLowerCase();
    return DEFAULT_ALLOWED_ORIGINS.includes(value) || extra.some((o) => o.trim().toLowerCase() === value);
}

const digest = (value) => createHash('sha256').update(String(value), 'utf8').digest();

export function tokensEqual(given, expected) {
    if (typeof given !== 'string' || given.length === 0) return false;
    return timingSafeEqual(digest(given), digest(expected));
}
