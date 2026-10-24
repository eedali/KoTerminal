// KoBar > Settings > Plugins > KoTerminal (tune icon). Rendered by KoBar in the main window, inside a dark wrapper.
import { DEFAULTS, readConfig, writeConfig } from './config.js';
import { useT } from './i18n.js';

const { useRef, useState } = window.React;

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20];
const SCROLLBACK = [1000, 5000, 10000, 20000, 50000];

export function createSettingsPanel(manager) {
    return function SettingsPanel() {
        const t = useT();
        const [config, setConfig] = useState(readConfig);
        const [portDraft, setPortDraft] = useState(String(config.port));
        const [showToken, setShowToken] = useState(false);
        const [test, setTest] = useState(null);
        const fileRef = useRef(null);

        const update = (patch) => {
            const next = writeConfig(patch);
            setConfig(next);
            return next;
        };

        const commitPort = () => {
            const port = Number(portDraft);
            if (Number.isInteger(port) && port >= 1024 && port <= 65535) update({ port });
            else setPortDraft(String(config.port));
        };

        const runTest = async () => {
            setTest({ tone: 'busy', text: t('testing') });
            const result = await manager.checkConnection(readConfig());
            if (result.status === 'ok') {
                const info = result.info;
                setTest({
                    tone: 'ok',
                    text: t('testOk', { version: info.version, platform: info.platform, shells: info.shells.map((s) => s.name).join(', ') }),
                });
            } else if (result.status === 'auth-failed') setTest({ tone: 'error', text: t('testAuth') });
            else setTest({ tone: 'error', text: t('testUnreachable', { port: readConfig().port }) });
        };

        const pickLauncher = (event) => {
            const file = event.target.files?.[0];
            const path = file ? window.api?.getFilePath?.(file) : '';
            if (path) update({ launcherPath: path });
            event.target.value = '';
        };

        const shells = manager.connection.info?.shells ?? [];

        return (
            <div className="kt-settings">
                <h4>{t('settingsTitle')}</h4>

                <div className="kt-field">
                    <label htmlFor="kt-token">{t('token')}</label>
                    <div className="kt-row">
                        <input
                            id="kt-token"
                            className="kt-input"
                            type={showToken ? 'text' : 'password'}
                            autoComplete="off"
                            spellCheck={false}
                            value={config.token}
                            onChange={(event) => update({ token: event.target.value })}
                        />
                        <button type="button" className="kt-btn" onClick={() => setShowToken((v) => !v)}>
                            {showToken ? t('hide') : t('show')}
                        </button>
                    </div>
                    <span className="kt-hint">{t('tokenHint')}</span>
                </div>

                <div className="kt-field">
                    <label htmlFor="kt-port">{t('port')}</label>
                    <div className="kt-row">
                        <input
                            id="kt-port"
                            className="kt-input"
                            type="number"
                            min={1024}
                            max={65535}
                            value={portDraft}
                            onChange={(event) => setPortDraft(event.target.value)}
                            onBlur={commitPort}
                        />
                        <button type="button" className="kt-btn kt-btn-primary" disabled={!config.token || test?.tone === 'busy'} onClick={runTest}>
                            {t('test')}
                        </button>
                    </div>
                    <span className="kt-hint">{t('portHint')}</span>
                    {test ? (
                        <span className="kt-status" role="status" data-tone={test.tone}>
                            {test.text}
                        </span>
                    ) : null}
                </div>

                <div className="kt-field">
                    <label htmlFor="kt-shell">{t('shell')}</label>
                    <select id="kt-shell" value={config.shell} onChange={(event) => update({ shell: event.target.value })}>
                        <option value="">{t('shellAuto')}</option>
                        {shells.map((shell) => (
                            <option key={shell.id} value={shell.id}>{shell.name}</option>
                        ))}
                        {config.shell && !shells.some((s) => s.id === config.shell) ? <option value={config.shell}>{config.shell}</option> : null}
                    </select>
                </div>

                <div className="kt-row">
                    <div className="kt-field">
                        <label htmlFor="kt-font">{t('fontSize')}</label>
                        <select id="kt-font" value={config.fontSize} onChange={(event) => update({ fontSize: Number(event.target.value) })}>
                            {FONT_SIZES.map((size) => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </div>
                    <div className="kt-field">
                        <label htmlFor="kt-size">{t('size')}</label>
                        <select id="kt-size" value={config.size} onChange={(event) => update({ size: event.target.value })}>
                            <option value="s">{t('sizeS')}</option>
                            <option value="m">{t('sizeM')}</option>
                            <option value="l">{t('sizeL')}</option>
                        </select>
                    </div>
                    <div className="kt-field">
                        <label htmlFor="kt-scrollback">{t('scrollback')}</label>
                        <select id="kt-scrollback" value={config.scrollback} onChange={(event) => update({ scrollback: Number(event.target.value) })}>
                            {[...new Set([...SCROLLBACK, config.scrollback])].sort((a, b) => a - b).map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <label className="kt-row">
                    <input type="checkbox" checked={config.cursorBlink} onChange={(event) => update({ cursorBlink: event.target.checked })} />
                    <span>{t('cursorBlink')}</span>
                </label>

                <div className="kt-field">
                    <span>{t('launcher')}</span>
                    <span className="kt-path">{config.launcherPath || t('launcherNone')}</span>
                    <div className="kt-row">
                        <button type="button" className="kt-btn" onClick={() => fileRef.current?.click()}>{t('launcherPick')}</button>
                        {config.launcherPath ? (
                            <button type="button" className="kt-btn" onClick={() => update({ launcherPath: DEFAULTS.launcherPath })}>{t('launcherClear')}</button>
                        ) : null}
                        <input ref={fileRef} type="file" accept=".vbs,.cmd,.bat,.command,.sh" hidden onChange={pickLauncher} />
                    </div>
                    <span className="kt-hint">{t('launcherHint')}</span>
                </div>

                <span className="kt-hint">{t('shortcuts')}</span>
            </div>
        );
    };
}
