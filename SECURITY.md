# KoTerminal security notes

KoTerminal gives KoBar a way to run shell commands as you. This page says what protects that, and what does not.

## What the bridge does

- **Local only.** It listens on `127.0.0.1` only (default port `47011`), so other computers cannot reach it.
- **The pairing token is the real barrier.** Every connection must send it as its first message within 5 seconds.
  - It is 32 random bytes, compared in constant time.
  - It is stored in `bridge.json` in your user profile: owner-only permissions on macOS/Linux, the machine-local
    `%LOCALAPPDATA%` on Windows.
  - A wrong token is answered after a short delay and the connection is closed. There is no global lockout, because
    anything that can reach the port could otherwise lock you out.
  - At most 16 connections may be waiting to log in at a time.
- **Two more layers on top of the token:**
  - The `Host` must be `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS-rebinding pages.
  - The `Origin` must be `file://` (packaged KoBar), missing (a local program), or listed in `allowedOrigins`.
    Browsers always send an `Origin` and pages cannot fake it, so web pages are refused. That includes sandboxed
    iframes, which send `null`.
- **Allowing KoBar's development build.** To use KoTerminal with a development build (`npm run dev`, origin
  `http://localhost:5173`), add that origin to `allowedOrigins`. Any page served from that address can then reach the
  login step, but it still needs the token.
- **No executables from clients.** Clients choose a shell by **id** from the bridge's list; they cannot name an
  executable. Malformed messages close the connection. An oversized input frame is refused and the shell keeps running.
- **Limits.** At most 8 terminals run at once (`maxSessions` in `bridge.json`), and closing a connection ends its shell.
- **No logging of your data.** The bridge never logs your input, its output, or the token.

## What it cannot protect

- **Other KoBar plugins.** KoBar plugins run in the same window with full privileges and can read each other's settings.
  A plugin you install could read KoTerminal's token and use the bridge. Install only KoBar plugins you trust; this is
  true for KoBar in general.
- **Programs already running as you.** They can read `bridge.json` anyway, so they gain nothing from the bridge.
- **Other users of the same computer.** Loopback is shared by every account on the machine. If the bridge is not
  running, another user could listen on its port and receive the token when KoTerminal connects. The plugin does not
  verify the bridge (a challenge-response login is planned for protocol v2). On a shared computer, keep the bridge
  running or use a different port.
- **Someone at your unlocked computer.**

## Good practice

- Treat the token like a password. Do not paste it into chats, issues or screenshots.
- If it may have leaked, run `npm run rotate-token` in `bridge/` and paste the new token into the KoTerminal settings.
- Stop the bridge when you do not need it (close its window, or `npm run autostart:remove`).
- Keep the bridge's dependencies up to date (`npm update` in `bridge/`).

## Reporting a problem

Please open a [GitHub security advisory](https://github.com/eedali/KoTerminal/security/advisories/new) for anything that
lets a page, another user or another computer reach the bridge. For other issues, use the issue tracker.
