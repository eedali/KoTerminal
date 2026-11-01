// One <style> element for xterm's CSS and the plugin's own classes (all prefixed kt-). Re-running the plugin replaces
// it instead of adding another.
import xtermCss from '@xterm/xterm/css/xterm.css?inline';

const STYLE_ID = 'koterminal-style';

const CSS = `
.kt-panel { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
  background: var(--kb-bg-shell, var(--theme-bg-dark, #1f1f1f)); color: var(--kb-fg-1, rgba(255, 255, 255, 0.92)); border: 1px solid var(--kb-stroke-subtle, var(--theme-border, #3a3a3a));
  border-radius: 32px; box-shadow: var(--kb-shadow-e3, 0 8px 28px rgba(0, 0, 0, 0.32)); font: 14px/20px var(--kb-font, system-ui, -apple-system, "Segoe UI", sans-serif); }
.kt-panel *, .kt-settings * { box-sizing: border-box; }
.kt-panel .material-symbols-outlined, .kt-settings .material-symbols-outlined { font-family: 'Material Symbols Rounded', 'Material Symbols Outlined'; font-variation-settings: 'FILL' 0, 'wght' 400; }
.kt-panel button, .kt-settings button { font: inherit; }
.kt-top { flex: none; display: flex; flex-direction: column; gap: 12px; padding: 20px 20px 12px; }
.kt-head { display: flex; align-items: center; gap: 12px; }
.kt-tile { flex: none; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 15px;
  background: var(--kb-bg-container, var(--theme-accent-glow, rgba(244, 161, 37, 0.2))); color: var(--kb-accent, var(--theme-primary, #f4a125)); }
.kt-tile .material-symbols-outlined { font-size: 24px; }
.kt-tile.kt-xl { width: 64px; height: 64px; border-radius: 22px; }
.kt-tile.kt-xl .material-symbols-outlined { font-size: 32px; }
.kt-tile[data-tone="error"] { color: var(--kb-danger, #ff99a4); }
.kt-titles { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.kt-title { font-family: var(--kb-font-display, inherit); font-size: 19px; line-height: 24px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kt-sub { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; color: var(--kb-fg-2, rgba(255, 255, 255, 0.68)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kt-icon-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0;
  border: 0; border-radius: 50%; background: var(--kb-bg-inset, rgba(255, 255, 255, 0.06)); color: var(--kb-fg-1, rgba(255, 255, 255, 0.86)); cursor: pointer; }
.kt-icon-btn.kt-tonal { background: var(--kb-bg-container, rgba(255, 255, 255, 0.1)); color: var(--kb-on-container, rgba(255, 255, 255, 0.92)); }
.kt-icon-btn.kt-small { width: 24px; height: 24px; background: transparent; color: inherit; }
.kt-icon-btn:hover { background: var(--kb-fill-hover, rgba(255, 255, 255, 0.1)); }
.kt-icon-btn.kt-tonal:hover { filter: brightness(1.12); background: var(--kb-bg-container, rgba(255, 255, 255, 0.1)); }
.kt-icon-btn .material-symbols-outlined { font-size: 20px; }
.kt-icon-btn.kt-small .material-symbols-outlined { font-size: 16px; }
.kt-panel button:focus-visible, .kt-panel select:focus-visible, .kt-settings button:focus-visible,
.kt-settings input:focus-visible, .kt-settings select:focus-visible { outline: 2px solid var(--kb-accent, var(--theme-primary, #f4a125)); outline-offset: 2px; }
.kt-tabrow { display: flex; align-items: center; gap: 8px; }
.kt-tabs { flex: 1; min-width: 0; display: flex; gap: 4px; padding: 4px; border-radius: 999px; background: var(--kb-bg-inset, rgba(255, 255, 255, 0.06)); overflow-x: auto; scrollbar-width: none; }
.kt-tabs::-webkit-scrollbar { display: none; }
.kt-tab { flex: none; display: flex; align-items: center; height: 36px; border-radius: 999px; max-width: 220px; color: var(--kb-fg-2, rgba(255, 255, 255, 0.68)); }
.kt-tab:hover { background: var(--kb-fill-hover, rgba(255, 255, 255, 0.06)); }
.kt-tab[data-active="true"] { background: var(--kb-bg-container, rgba(255, 255, 255, 0.12)); color: var(--kb-on-container, rgba(255, 255, 255, 0.92)); font-weight: 600; }
.kt-tab-main { display: flex; align-items: center; gap: 8px; min-width: 0; height: 36px; padding: 0 4px 0 14px; border-radius: 999px; border: 0; background: transparent; color: inherit; font-weight: inherit; cursor: pointer; }
.kt-tab-main span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-tab .kt-icon-btn.kt-small { margin-right: 6px; }
.kt-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--kb-fg-3, rgba(255, 255, 255, 0.46)); }
.kt-dot[data-status="running"] { background: var(--kb-success, #6ccb5f); }
.kt-dot[data-status="exited"] { background: var(--kb-warning, #fce100); }
.kt-dot[data-status="failed"] { background: var(--kb-danger, #ff99a4); }
.kt-dot[data-state="running"] { background: var(--kb-success, #6ccb5f); }
.kt-dot[data-state="exited"] { background: var(--kb-warning, #fce100); }
.kt-dot[data-state="failed"] { background: var(--kb-danger, #ff99a4); }
.kt-split { flex: none; display: inline-flex; align-items: center; height: 44px; border-radius: 999px; background: var(--kb-bg-container, rgba(255, 255, 255, 0.1)); color: var(--kb-on-container, #fff); }
.kt-split .kt-icon-btn { background: transparent; color: inherit; width: 40px; height: 44px; border-radius: 999px 0 0 999px; }
.kt-split .kt-icon-btn:hover { background: var(--kb-fill-hover, rgba(255, 255, 255, 0.1)); filter: none; }
.kt-shell-picker { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; color: inherit; width: 32px; height: 44px; border-radius: 0 999px 999px 0; }
.kt-shell-picker:hover { background: var(--kb-fill-hover, rgba(255, 255, 255, 0.08)); }
.kt-shell-picker .material-symbols-outlined { font-size: 20px; pointer-events: none; }
.kt-shell-select { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; color: transparent; cursor: pointer; appearance: none; opacity: 0; }
.kt-body { flex: 1; min-height: 0; position: relative; margin: 0 12px 12px; padding: 12px 6px 10px 16px; border-radius: 24px; overflow: hidden; background: var(--kt-term-bg, var(--kb-bg-inset, #181818)); }
.kt-body[data-message="true"] { padding: 0; background: transparent; overflow: auto; }
.kt-term { width: 100%; height: 100%; }
.kt-term .xterm { height: 100%; }
.kt-message { height: 100%; min-height: min-content; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 20px 32px; padding: 8px 8px 12px; user-select: text; }
.kt-message-col { flex: 1 1 240px; max-width: 360px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.kt-message-col.kt-center { align-items: center; text-align: center; margin: 0 auto; }
.kt-message h3 { margin: 4px 0 0; font-family: var(--kb-font-display, inherit); font-size: 17px; line-height: 24px; font-weight: 600; }
.kt-message p { margin: 0; color: var(--kb-fg-2, rgba(255, 255, 255, 0.78)); }
.kt-message code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; }
.kt-steps { flex: 1 1 260px; max-width: 360px; margin: 0; padding: 16px; list-style: none; display: flex; flex-direction: column; gap: 12px; border-radius: 24px; background: var(--kb-bg-surface, rgba(255, 255, 255, 0.04)); }
.kt-steps li { display: flex; gap: 12px; align-items: flex-start; color: var(--kb-fg-1, rgba(255, 255, 255, 0.92)); }
.kt-step-n { flex: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 13px; font-weight: 700;
  background: var(--kb-bg-container, rgba(255, 255, 255, 0.12)); color: var(--kb-on-container, #fff); font-variant-numeric: tabular-nums; }
.kt-steps li > span:last-child { padding-top: 3px; }
.kt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.kt-center .kt-actions { justify-content: center; }
.kt-external { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.kt-caption { font-size: 12px; line-height: 16px; color: var(--kb-fg-2, rgba(255, 255, 255, 0.68)); }
.kt-btn { height: 40px; padding: 0 20px; border-radius: 999px; border: 0; display: inline-flex; align-items: center; gap: 8px; font-weight: 600;
  background: var(--kb-bg-container, rgba(255, 255, 255, 0.1)); color: var(--kb-on-container, rgba(255, 255, 255, 0.92)); cursor: pointer; }
.kt-btn:hover { filter: brightness(1.12); }
.kt-btn-primary { background: var(--kb-accent, var(--theme-primary, #f4a125)); color: var(--kb-on-accent, #141414); }
.kt-btn-primary:hover { filter: brightness(1.08); }
.kt-btn.kt-chip { height: 32px; padding: 0 14px; border-radius: 10px; font-weight: 500; background: transparent; color: var(--kb-fg-1, rgba(255, 255, 255, 0.92)); box-shadow: inset 0 0 0 1px var(--kb-stroke-control, rgba(255, 255, 255, 0.24)); }
.kt-btn.kt-chip:hover { filter: none; background: var(--kb-fill-hover, rgba(255, 255, 255, 0.08)); }
.kt-btn:disabled { opacity: var(--kb-opacity-disabled, 0.5); cursor: default; filter: none; }
.kt-progress { width: 160px; height: 4px; border-radius: 2px; overflow: hidden; background: var(--kb-ring-track, rgba(255, 255, 255, 0.14)); }
.kt-progress > span { display: block; width: 40%; height: 100%; border-radius: 2px; background: var(--kb-accent, #f4a125); }
.kt-settings { display: flex; flex-direction: column; gap: 16px; color: var(--kb-fg-1, rgba(255, 255, 255, 0.92)); font-size: 14px; line-height: 20px; font-family: var(--kb-font, inherit); }
.kt-card { display: flex; flex-direction: column; gap: 16px; padding: 20px; border-radius: 24px; background: var(--kb-bg-surface, rgba(255, 255, 255, 0.04)); }
.kt-card h4 { margin: 0; font-family: var(--kb-font-display, inherit); font-size: 15px; line-height: 20px; font-weight: 600; }
.kt-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.kt-field > label, .kt-field > span:first-child { font-size: 12px; line-height: 16px; color: var(--kb-fg-2, rgba(255, 255, 255, 0.68)); }
.kt-hint { color: var(--kb-fg-2, rgba(255, 255, 255, 0.62)); font-size: 12px; line-height: 18px; }
.kt-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.kt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.kt-input, .kt-settings select { height: 44px; padding: 0 16px; border-radius: 16px; border: 1px solid transparent; width: 100%;
  background: var(--kb-bg-inset, rgba(0, 0, 0, 0.25)); color: var(--kb-fg-1, rgba(255, 255, 255, 0.92)); font: inherit; }
.kt-input { flex: 1; min-width: 0; }
.kt-input[type="number"] { flex: none; width: 120px; }
.kt-settings select { appearance: none; padding-right: 36px; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--kb-fg-2, #aaa) 50%), linear-gradient(135deg, var(--kb-fg-2, #aaa) 50%, transparent 50%);
  background-position: calc(100% - 20px) 19px, calc(100% - 15px) 19px; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.kt-status { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; padding: 10px 14px; border-radius: 16px; background: var(--kb-bg-inset, rgba(0, 0, 0, 0.2)); }
.kt-status .material-symbols-outlined { font-size: 18px; flex: none; }
.kt-status[data-tone="ok"] .material-symbols-outlined { color: var(--kb-success, #6ccb5f); }
.kt-status[data-tone="error"] .material-symbols-outlined { color: var(--kb-danger, #ff99a4); }
.kt-path { font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; color: var(--kb-fg-1, rgba(255, 255, 255, 0.78)); word-break: break-all; padding: 10px 14px; border-radius: 16px; background: var(--kb-bg-inset, rgba(0, 0, 0, 0.2)); }
.kt-seg { display: flex; gap: 4px; padding: 4px; border-radius: 16px; background: var(--kb-bg-inset, rgba(0, 0, 0, 0.25)); }
.kt-seg button { flex: 1; height: 36px; border: 0; border-radius: 12px; background: transparent; color: var(--kb-fg-2, rgba(255, 255, 255, 0.68)); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.kt-seg button[aria-checked="true"] { background: var(--kb-bg-container, rgba(255, 255, 255, 0.12)); color: var(--kb-on-container, #fff); font-weight: 600; }
.kt-seg .material-symbols-outlined { font-size: 16px; color: var(--kb-accent, #f4a125); }
.kt-switch-row { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.kt-switch { flex: none; position: relative; width: 52px; height: 32px; padding: 0; border: 0; border-radius: 16px; cursor: pointer; background: var(--kb-bg-inset, rgba(0, 0, 0, 0.3)); box-shadow: inset 0 0 0 2px var(--kb-stroke-control, rgba(255, 255, 255, 0.3)); }
.kt-switch::after { content: ""; position: absolute; top: 8px; left: 8px; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-fg-2, #aaa); transition: all 100ms var(--kb-ease-standard, ease); }
.kt-switch[aria-checked="true"] { background: var(--kb-accent, #f4a125); box-shadow: none; }
.kt-switch[aria-checked="true"]::after { top: 4px; left: 24px; width: 24px; height: 24px; background: var(--kb-on-accent, #141414); }
.kt-keys { display: flex; flex-direction: column; gap: 8px; }
.kt-key-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.kt-key-row kbd { font: 600 12px/16px "Cascadia Mono", Consolas, monospace; padding: 4px 8px; border-radius: 8px; background: var(--kb-bg-inset, rgba(0, 0, 0, 0.25)); color: var(--kb-fg-1, #fff); }
@media (prefers-reduced-motion: reduce) { .kt-switch::after { transition: none; } }
`;

export function injectStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = `${xtermCss}\n${CSS}`;
}
