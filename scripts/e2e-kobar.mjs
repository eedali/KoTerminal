// End-to-end check in a real KoBar: starts a bridge on a test port with a throw-away config, launches a BUILT KoBar
// checkout with a fresh temporary profile (never your real one) that has only KoTerminal installed, opens the panel,
// runs a command in the default shell, checks tabs and that a terminal survives closing the panel, and saves
// screenshots. Nothing touches the clipboard.
//
//   node scripts/e2e-kobar.mjs --kobar "D:/path/to/KoBar" [--shots <dir>]
//
// Needs: `npm run build` in this repo and in the KoBar checkout (dist/ and dist-electron/), `npm install` in bridge/.
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ID = 'com.eedali.koterminal';
const PORT = 47999;
const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const kobarRoot = path.resolve(arg('--kobar') ?? '');
const shotsDir = path.resolve(arg('--shots') ?? path.join(ROOT, 'e2e-output'));

function check(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`  ok  ${message}`);
}

if (!fs.existsSync(path.join(kobarRoot, 'dist', 'index.html')) || !fs.existsSync(path.join(kobarRoot, 'dist-electron', 'main.cjs'))) {
    throw new Error(`No built KoBar at ${kobarRoot} (run npm run build there).`);
}
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.js'))) throw new Error('Run npm run build in KoTerminal first.');
const { _electron } = createRequire(path.join(kobarRoot, 'package.json'))('playwright-core');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kobar-e2e-koterminal-'));
const userData = path.join(tmp, 'profile');
const bridgeConfig = path.join(tmp, 'bridge');
fs.mkdirSync(path.join(userData, 'extensions', PLUGIN_ID), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(userData, 'extensions', PLUGIN_ID, 'manifest.json'));
fs.mkdirSync(path.join(userData, 'extensions', PLUGIN_ID, 'dist'));
fs.copyFileSync(path.join(ROOT, 'dist', 'index.js'), path.join(userData, 'extensions', PLUGIN_ID, 'dist', 'index.js'));
fs.mkdirSync(shotsDir, { recursive: true });

let bridge;
let app;
let page;
let bridgeLog = '';
const pageErrors = [];
try {
    console.log('Starting the bridge on a test port…');
    // Shells start in the drive root (home = root) so screenshots show no personal folder names.
    const neutralHome = path.parse(os.tmpdir()).root;
    bridge = spawn(process.execPath, [path.join(ROOT, 'bridge', 'src', 'cli.js'), '--port', String(PORT)], {
        env: { ...process.env, KOTERMINAL_CONFIG_DIR: bridgeConfig, USERPROFILE: neutralHome, HOME: neutralHome, KOTERMINAL_LOG_ORIGINS: "1" },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    bridge.stdout.on('data', (d) => (bridgeLog += d.toString()));
    bridge.stderr.on('data', (d) => (bridgeLog += d.toString()));
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bridge did not start')), 15000);
        bridge.stdout.on('data', (d) => d.toString().includes('listening on') && (clearTimeout(timer), resolve()));
        bridge.on('exit', (code) => reject(new Error(`bridge exited ${code}`)));
    });
    const token = JSON.parse(fs.readFileSync(path.join(bridgeConfig, 'bridge.json'), 'utf8')).token;

    console.log('Launching KoBar with a temporary profile…');
    const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
    env.KOBAR_E2E_LOAD_DIST = '1';
    delete env.KOBAR_CSP_REPORT;
    app = await _electron.launch({ cwd: kobarRoot, args: [`--user-data-dir=${userData}`, '.'], env, timeout: 30000 });
    const actual = await app.evaluate(({ app: a }) => a.getPath('userData'));
    check(fs.realpathSync.native(actual).toLowerCase() === fs.realpathSync.native(userData).toLowerCase(), 'KoBar uses the temporary profile');

    page = await app.firstWindow({ timeout: 30000 });
    const errors = pageErrors;
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 300)));
    await page.waitForFunction(() => window.useAppStore?.persist?.hasHydrated?.() === true, undefined, { timeout: 20000 });
    await page.waitForFunction((id) => Boolean(window.KoBarExtensions?.getPanel?.(id)), PLUGIN_ID, { timeout: 20000 });
    check(true, 'KoTerminal is loaded and registered its panel');
    const ids = await page.evaluate((id) => ({ button: window.KoBarExtensions.getButtons().some((b) => b.id === id), settings: Boolean(window.KoBarExtensions.getSettingsPanel(id)) }), PLUGIN_ID);
    check(ids.button && ids.settings, 'button and settings panel are registered under the plugin id');

    await page.evaluate(({ id, port, token: tk }) => window.KoBarExtensions.setData(id, { port, token: tk }), { id: PLUGIN_ID, port: PORT, token });
    // A fresh profile starts in mini mode (no plugin panel is drawn) with the first-run cards on top: skip both.
    await page.evaluate((id) => {
        const store = window.useAppStore.getState();
        store.setOnboarding?.({ status: 'skipped' });
        if (store.isMiniMode) (store.setMiniMode ?? ((v) => window.useAppStore.setState({ isMiniMode: v })))(false);
        store.closeAllUtilityPopups();
        window.useAppStore.setState({ activeExtensionPanelId: id });
    }, PLUGIN_ID);

    await page.waitForSelector('.kt-panel .kt-dot[data-status="running"]', { timeout: 20000 });
    check(true, 'the panel opened a shell through the bridge');
    const marker = await page.evaluate(() => window.useAppStore.getState().isMac);
    const command = marker ? 'echo "KT""_E2E_OK"' : 'echo ("KT" + "_E2E_OK")';
    await page.click('.kt-panel .xterm');
    await page.keyboard.type(command);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /KT_E2E_OK/.test(document.querySelector('.kt-panel .xterm-rows')?.textContent ?? ''), undefined, { timeout: 15000 });
    check(true, 'a typed command ran and its output is shown');
    await page.locator('.kt-panel').screenshot({ path: path.join(shotsDir, 'koterminal-1-command.png') });

    await page.click('.kt-panel button[aria-label="New terminal"]');
    await page.waitForFunction(() => document.querySelectorAll('.kt-panel .kt-tab').length === 2 && document.querySelectorAll('.kt-dot[data-status="running"]').length === 2, undefined, { timeout: 20000 });
    check(true, 'a second tab opened its own shell');
    await page.locator('.kt-panel').screenshot({ path: path.join(shotsDir, 'koterminal-2-tabs.png') });
    await page.click('.kt-panel .kt-tab:nth-child(2) button[aria-label^="Close terminal"]');
    await page.waitForFunction(() => document.querySelectorAll('.kt-panel .kt-tab').length === 1, undefined, { timeout: 5000 });
    check(true, 'closing a tab removes it');

    await page.evaluate(() => window.useAppStore.setState({ activeExtensionPanelId: null }));
    await page.waitForSelector('.kt-panel', { state: 'detached' });
    await page.evaluate((id) => window.useAppStore.setState({ activeExtensionPanelId: id }), PLUGIN_ID);
    await page.waitForFunction(() => /KT_E2E_OK/.test(document.querySelector('.kt-panel .xterm-rows')?.textContent ?? ''), undefined, { timeout: 10000 });
    check(true, 'the terminal and its output survive closing and reopening the panel');

    const active = await page.evaluate(() => document.querySelector('button[aria-pressed="true"], [data-active="true"]') !== null);
    console.log(`  info bar marks a button active: ${active}`);
    await page.screenshot({ path: path.join(shotsDir, 'koterminal-3-window.png') });
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    const origins = [...new Set(bridgeLog.match(/\[bridge\] origin \S+/g) ?? [])].map((l) => l.replace('[bridge] origin ', ''));
    console.log(`  info Origin header(s) KoBar sent: ${origins.join(', ')}`);
    console.log(`\nAll checks passed. Screenshots: ${shotsDir}`);
} catch (err) {
    console.error(`\nFAILED: ${err.message.split('\n')[0]}`);
    if (page) {
        const state = await page
            .evaluate((id) => {
                const m = window.__koTerminal?.[id]?.manager;
                const s = window.useAppStore.getState();
                return {
                    isMiniMode: s.isMiniMode,
                    activePanel: s.activeExtensionPanelId,
                    panelText: document.querySelector('.kt-panel')?.innerText?.slice(0, 600) ?? '(no panel)',
                    connection: m?.connection?.status,
                    sessions: m?.sessions?.map((s) => ({ title: s.title, status: s.status })),
                    config: window.KoBarExtensions.getData(id, {}),
                };
            }, PLUGIN_ID)
            .catch((e) => ({ error: e.message }));
        console.error('page state:', JSON.stringify({ ...state, config: { ...state.config, token: state.config?.token ? '(set)' : '' } }, null, 2));
        console.error('page errors:', JSON.stringify(pageErrors));
        await page.screenshot({ path: path.join(shotsDir, 'koterminal-failure.png') }).catch(() => {});
    }
    const noise = /AttachConsole|^\s+at |conpty_console|consoleProcessList|^\s*\^$|^Node\.js|^$|^\s{4}\S{40,}$/;
    console.error('bridge log:\n' + bridgeLog.split('\n').filter((l) => !noise.test(l)).join('\n'));
    process.exitCode = 1;
} finally {
    if (app) {
        const proc = app.process();
        await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
        if (proc.exitCode === null && proc.pid) {
            if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
            else proc.kill('SIGKILL');
        }
    }
    if (bridge && bridge.exitCode === null) {
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(bridge.pid), '/t', '/f'], { stdio: 'ignore' });
        else bridge.kill('SIGTERM');
    }
    if (path.basename(tmp).startsWith('kobar-e2e-koterminal-')) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
