# Changelog

## 1.0.0 - 2026-10-24

First release.

- KoBar plugin: an xterm.js terminal panel next to the bar. It has tabs, a shell picker, copy and paste, restart on
  Enter, and colours from KoBar's accent. Terminals keep running while the panel is closed.
- Settings in KoBar (Settings > Plugins > KoTerminal):
  - pairing token, port and connection test;
  - default shell, font size, panel size, cursor and scrollback;
  - an optional bridge launcher.
- KoTerminal bridge: shells through node-pty on `127.0.0.1`.
  - Detects PowerShell 7, Windows PowerShell, Command Prompt, Git Bash and WSL on Windows, and `$SHELL`, zsh and bash on
    macOS/Linux.
  - Protected by a pairing token, a `Host` check and an `Origin` check (`file://` only by default).
  - A wrong token is answered with a delay, waiting logins are limited, and the number of sessions is capped.
  - Autostart at login on Windows.
- English and Turkish.
