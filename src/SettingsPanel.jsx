// KoBar > Settings > Plugins > KoTerminal (tune icon). Rendered by KoBar in the main window, inside a dark wrapper.
// Three cards: connection, terminal, launcher.
import { DEFAULTS, readConfig, writeConfig } from './config.js';
import { useT } from './i18n.js';

const { useRef, useState } = window.React;

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20];
const SCROLLBACK = [1000, 5000, 10000, 20000, 50000];

function Icon({ name }) {
    return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

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
        const sizes = [['s', 'sizeS'], ['m', 'sizeM'], ['l', 'sizeL']];
        const shortcuts = [['Ctrl+Shift+T', 'scNew'], ['Ctrl+Shift+W', 'scClose'], ['Ctrl+Shift+C', 'scCopy'], ['Ctrl+V', 'scPaste']];

        return (
            <div className="kt-settings">
                <div className="kt-head">
                    <span className="kt-tile"><Icon name="terminal" /></span>
                    <div className="kt-titles">
                        <span className="kt-title">{t('settingsTitle')}</span>
                    </div>
                </div>

                <section className="kt-card">
                    <h4>{t('cardConnection')}</h4>
                    <div className="kt-field">
                        <label htmlFor="kt-token">{t('token')}</label>
                        <div className="kt-row" style={{ flexWrap: 'nowrap' }}>
                            <input
                                id="kt-token"
                                className="kt-input"
                                type={showToken ? 'text' : 'password'}
                                autoComplete="off"
                                spellCheck={false}
                                value={config.token}
                                onChange={(event) => update({ token: event.target.value })}
                            />
                            <button type="button" className="kt-icon-btn kt-tonal" aria-label={showToken ? t('hide') : t('show')} title={showToken ? t('hide') : t('show')} onClick={() => setShowToken((v) => !v)}>
                                <Icon name={showToken ? 'visibility_off' : 'visibility'} />
                            </button>
                        </div>
                        <span className="kt-hint">{t('tokenHint')}</span>
                    </div>

                    <div className="kt-field">
                        <label htmlFor="kt-port">{t('port')}</label>
                        <div className="kt-row" style={{ flexWrap: 'nowrap' }}>
                            <input
                                id="kt-port"
                                className="kt-input"
                                type="number"
                                min={1024}
                                max={65535}
                                value={portDraft}
                                onChange={(event) => setPortDraft(event.target.value)}
                                onBlur={commitPort}
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                            />
                            <button type="button" className="kt-btn kt-btn-primary" disabled={!config.token || test?.tone === 'busy'} onClick={runTest}>
                                {t('test')}
                            </button>
                        </div>
                        <span className="kt-hint">{t('portHint')}</span>
                        {test ? (
                            <span className="kt-status" role="status" data-tone={test.tone}>
                                <Icon name={test.tone === 'ok' ? 'check_circle' : test.tone === 'error' ? 'error' : 'progress_activity'} />
                                <span>{test.text}</span>
                            </span>
                        ) : null}
                    </div>
                </section>

                <section className="kt-card">
                    <h4>{t('cardTerminal')}</h4>
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

                    <div className="kt-field">
                        <span id="kt-size-label">{t('size')}</span>
                        <div id="kt-size" className="kt-seg" role="radiogroup" aria-labelledby="kt-size-label">
                            {sizes.map(([value, key]) => (
                                <button key={value} type="button" role="radio" aria-checked={config.size === value} onClick={() => update({ size: value })}>
                                    {config.size === value ? <Icon name="check" /> : null}
                                    <span>{t(key)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="kt-grid">
                        <div className="kt-field">
                            <label htmlFor="kt-font">{t('fontSize')}</label>
                            <select id="kt-font" value={config.fontSize} onChange={(event) => update({ fontSize: Number(event.target.value) })}>
                                {FONT_SIZES.map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
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

                    <div className="kt-switch-row">
                        <span id="kt-blink-label">{t('cursorBlink')}</span>
                        <button
                            type="button"
                            role="switch"
                            className="kt-switch"
                            aria-checked={config.cursorBlink}
                            aria-labelledby="kt-blink-label"
                            onClick={() => update({ cursorBlink: !config.cursorBlink })}
                        />
                    </div>
                </section>

                <section className="kt-card">
                    <h4>{t('launcher')}</h4>
                    <span className="kt-path">{config.launcherPath || t('launcherNone')}</span>
                    <div className="kt-row">
                        <button type="button" className="kt-btn" onClick={() => fileRef.current?.click()}>{t('launcherPick')}</button>
                        {config.launcherPath ? (
                            <button type="button" className="kt-btn kt-chip" onClick={() => update({ launcherPath: DEFAULTS.launcherPath })}>{t('launcherClear')}</button>
                        ) : null}
                        <input ref={fileRef} type="file" accept=".vbs,.cmd,.bat,.command,.sh" hidden onChange={pickLauncher} />
                    </div>
                    <span className="kt-hint">{t('launcherHint')}</span>
                </section>

                <section className="kt-card">
                    <h4>{t('scTitle')}</h4>
                    <div className="kt-keys">
                        {shortcuts.map(([keys, label]) => (
                            <div key={keys} className="kt-key-row">
                                <span>{t(label)}</span>
                                <kbd>{keys}</kbd>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        );
    };
}
