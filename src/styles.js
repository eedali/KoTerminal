// One <style> element for xterm's CSS and the plugin's own classes (all prefixed kt-). Re-running the plugin replaces
// it instead of adding another.
import xtermCss from '@xterm/xterm/css/xterm.css?inline';

const STYLE_ID = 'koterminal-style';

const CSS = `
.kt-panel { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
  background: var(--theme-bg-dark, #1f1f1f); color: rgba(255, 255, 255, 0.92); border: 1px solid var(--theme-border, #3a3a3a);
  border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.32); font: 13px/20px system-ui, -apple-system, "Segoe UI", sans-serif; }
.kt-panel *, .kt-settings * { box-sizing: border-box; }
.kt-header { flex: none; height: 36px; display: flex; align-items: center; gap: 4px; padding: 0 4px 0 10px;
  border-bottom: 1px solid var(--theme-border, #3a3a3a); }
.kt-title { display: flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; margin-right: 4px; }
.kt-title .material-symbols-outlined { font-size: 18px; color: var(--theme-primary, #f4a125); }
.kt-tabs { flex: 1; min-width: 0; display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
.kt-tabs::-webkit-scrollbar { display: none; }
.kt-tab { flex: none; display: flex; align-items: center; height: 26px; border-radius: 6px; max-width: 230px;
  color: rgba(255, 255, 255, 0.68); }
.kt-tab[data-active="true"] { background: rgba(255, 255, 255, 0.09); color: rgba(255, 255, 255, 0.92); }
.kt-tab-main { display: flex; align-items: center; gap: 6px; min-width: 0; height: 26px; padding: 0 4px 0 8px; border: 0;
  background: transparent; color: inherit; font: inherit; cursor: pointer; }
.kt-tab-main span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, 0.46); }
.kt-dot[data-status="running"] { background: #6ccb5f; }
.kt-dot[data-status="exited"] { background: #fce100; }
.kt-dot[data-status="failed"] { background: #ff99a4; }
.kt-icon-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;
  border: 0; border-radius: 6px; background: transparent; color: rgba(255, 255, 255, 0.68); cursor: pointer; }
.kt-icon-btn.kt-small { width: 22px; height: 22px; }
.kt-icon-btn:hover, .kt-tab-main:hover { background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.92); }
.kt-icon-btn .material-symbols-outlined { font-size: 18px; }
.kt-icon-btn.kt-small .material-symbols-outlined { font-size: 15px; }
.kt-panel button:focus-visible, .kt-panel select:focus-visible, .kt-settings button:focus-visible,
.kt-settings input:focus-visible, .kt-settings select:focus-visible { outline: 2px solid var(--theme-primary, #f4a125); outline-offset: 1px; }
.kt-shell-select { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: transparent;
  cursor: pointer; appearance: none; position: absolute; inset: 0; opacity: 0; }
.kt-shell-picker { position: relative; flex: none; width: 22px; height: 28px; display: inline-flex; align-items: center;
  justify-content: center; color: rgba(255, 255, 255, 0.68); border-radius: 6px; }
.kt-shell-picker:hover { background: rgba(255, 255, 255, 0.06); }
.kt-shell-picker .material-symbols-outlined { font-size: 16px; pointer-events: none; }
.kt-body { flex: 1; min-height: 0; position: relative; padding: 6px 2px 2px 8px; background: var(--kt-term-bg, #1f1f1f); }
.kt-term { width: 100%; height: 100%; }
.kt-term .xterm { height: 100%; }
.kt-message { height: 100%; overflow: auto; padding: 12px 10px; user-select: text; }
.kt-message h3 { margin: 0 0 6px; font-size: 15px; line-height: 22px; font-weight: 600; }
.kt-message p, .kt-message ol { margin: 0 0 10px; color: rgba(255, 255, 255, 0.78); }
.kt-message ol { padding-left: 20px; }
.kt-message code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; }
.kt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.kt-btn { height: 30px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--theme-border, #3a3a3a);
  background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.92); font: inherit; cursor: pointer; }
.kt-btn:hover { background: rgba(255, 255, 255, 0.1); }
.kt-btn-primary { background: var(--theme-primary, #f4a125); border-color: transparent; color: #141414; font-weight: 600; }
.kt-btn-primary:hover { background: var(--theme-primary, #f4a125); filter: brightness(1.08); }
.kt-btn:disabled { opacity: 0.45; cursor: default; }
.kt-settings { display: flex; flex-direction: column; gap: 14px; color: rgba(255, 255, 255, 0.92); font-size: 13px; line-height: 20px; }
.kt-settings h4 { margin: 0; font-size: 15px; font-weight: 600; }
.kt-field { display: flex; flex-direction: column; gap: 4px; }
.kt-field > label, .kt-field > span:first-child { font-weight: 600; }
.kt-hint { color: rgba(255, 255, 255, 0.62); font-size: 12px; line-height: 18px; }
.kt-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.kt-input, .kt-settings select { height: 32px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.36);
  background: rgba(0, 0, 0, 0.25); color: rgba(255, 255, 255, 0.92); font: inherit; }
.kt-input { flex: 1; min-width: 160px; }
.kt-input[type="number"] { flex: none; width: 110px; min-width: 0; }
.kt-status { font-size: 12px; line-height: 18px; }
.kt-status[data-tone="ok"] { color: #6ccb5f; }
.kt-status[data-tone="error"] { color: #ff99a4; }
.kt-path { font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; color: rgba(255, 255, 255, 0.78); word-break: break-all; }
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
