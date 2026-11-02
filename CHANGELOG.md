# Changelog

## 1.1.0 - 2026-11-02

- Canlı look: panel chrome restyled (shell radius 32 on the Canlı shell colour with e3 shadow, 44 px header icon tile, display-font title, round 36 px header buttons, tabs as an inset pill segmented control with a container-filled active tab, pill buttons with one filled accent button, inset radius 16 inputs); Material Symbols Rounded with Outlined fallback; Canlı tokens with fallbacks. Terminal colours, xterm options and the bridge are unchanged.
- Bar tile: label only (host label template); manifest `bar` block added (`sensitive: false`, `defaultSize: icon`).
- Redesigned from its functions: split new-terminal button with a shell picker at the end of the tab strip, clearer connection states.
- Bar tile: `value-caption` with the number of open terminals; error tone when the bridge does not answer.

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
