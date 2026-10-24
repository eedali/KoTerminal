// The panel next to the bar: tabs in the header (also the host's drag strip), the active terminal below.
import { PANEL_SIZES, readConfig } from './config.js';
import { useT } from './i18n.js';
import { readTheme } from './terminal.js';

const { useEffect, useLayoutEffect, useRef, useSyncExternalStore } = window.React;

const README_URL = 'https://github.com/eedali/KoTerminal#readme';

/**
 * Next to the bar on every edge; the panel lives inside the bar's wrapper (position: relative). The gap clears the
 * notes-panel toggle KoBar draws just outside the bar.
 */
function placement(edge, size) {
    const gap = 30;
    const box = { width: size.width, height: size.height };
    if (edge === 'left') return { ...box, left: '100%', top: 0, marginLeft: gap };
    if (edge === 'right') return { ...box, right: '100%', top: 0, marginRight: gap };
    if (edge === 'top') return { ...box, top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: gap };
    return { ...box, bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: gap };
}

function externalTerminals() {
    const platform = window.api?.getPlatform?.() ?? 'win32';
    if (platform === 'darwin') return [{ label: 'Terminal', path: '/System/Applications/Utilities/Terminal.app' }];
    if (platform === 'win32') {
        return [
            { label: 'PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
            { label: 'Command Prompt', path: 'C:\\Windows\\System32\\cmd.exe' },
        ];
    }
    return [];
}

function Icon({ name }) {
    return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function ExternalButtons({ t }) {
    const list = externalTerminals();
    if (list.length === 0) return null;
    return (
        <>
            <p>{t('external')}</p>
            <div className="kt-actions">
                {list.map((item) => (
                    <button key={item.path} type="button" className="kt-btn" onClick={() => window.api?.launchFile?.(item.path)}>
                        {item.label}
                    </button>
                ))}
            </div>
        </>
    );
}

const openSettings = () => window.useAppStore.getState().openPluginsTab?.();

function SetupView({ t }) {
    return (
        <div className="kt-message">
            <h3>{t('setupTitle')}</h3>
            <p>{t('setupBody')}</p>
            <ol>
                <li>{t('setupStep1')}</li>
                <li>{t('setupStep2')}</li>
                <li>{t('setupStep3')}</li>
            </ol>
            <div className="kt-actions">
                <button type="button" className="kt-btn kt-btn-primary" onClick={openSettings}>{t('openSettings')}</button>
                <button type="button" className="kt-btn" onClick={() => window.api?.openExternal?.(README_URL)}>{t('setupGuide')}</button>
            </div>
            <ExternalButtons t={t} />
        </div>
    );
}

function ProblemView({ t, manager, config, kind }) {
    const retry = () =>
        manager.checkConnection().then((result) => {
            if (result.status === 'ok' && manager.sessions.length === 0) manager.createSession();
        });
    const startBridge = () => {
        window.api?.launchFile?.(config.launcherPath);
        setTimeout(retry, 2500);
    };
    return (
        <div className="kt-message">
            <h3>{t(kind === 'auth' ? 'authTitle' : 'unreachableTitle')}</h3>
            <p>{kind === 'auth' ? t('authBody') : t('unreachableBody', { port: config.port })}</p>
            {kind !== 'auth' && window.location.protocol.startsWith('http') ? <p>{t('devOrigin', { origin: window.location.origin })}</p> : null}
            <div className="kt-actions">
                <button type="button" className="kt-btn kt-btn-primary" onClick={retry}>{t('retry')}</button>
                {kind !== 'auth' && config.launcherPath ? (
                    <button type="button" className="kt-btn" onClick={startBridge}>{t('startBridge')}</button>
                ) : null}
                <button type="button" className="kt-btn" onClick={openSettings}>{t('openSettings')}</button>
            </div>
            <ExternalButtons t={t} />
        </div>
    );
}

export function createTerminalPanel(manager) {
    return function TerminalPanel({ onClose }) {
        const t = useT();
        const edge = window.useAppStore((state) => state.edgePosition);
        useSyncExternalStore(manager.subscribe, manager.getSnapshot);
        const config = readConfig();
        const rootRef = useRef(null);
        const hostRef = useRef(null);
        const sessions = manager.sessions;
        const active = manager.active();
        const connection = manager.connection;

        useLayoutEffect(() => {
            const theme = readTheme(rootRef.current);
            manager.setTheme(theme);
            rootRef.current.style.setProperty('--kt-term-bg', theme.background);
        }, []);

        // First open with a token and no terminal: ask the bridge, then open the default shell.
        useEffect(() => {
            if (!config.token || manager.sessions.length > 0) return undefined;
            let cancelled = false;
            manager.checkConnection().then((result) => {
                if (!cancelled && result.status === 'ok' && manager.sessions.length === 0) manager.createSession();
            });
            return () => {
                cancelled = true;
            };
        }, [config.token, config.port]);

        useLayoutEffect(() => {
            if (active) manager.attach(hostRef.current);
        }, [active?.id]);

        useEffect(() => {
            const host = hostRef.current;
            return () => manager.detach(host);
        }, []);

        useEffect(() => {
            manager.applyConfig(config);
        }, [config.fontSize, config.cursorBlink, config.scrollback]);

        useEffect(() => {
            const host = hostRef.current;
            if (!host || typeof ResizeObserver === 'undefined') return undefined;
            let frame = 0;
            const observer = new ResizeObserver(() => {
                cancelAnimationFrame(frame);
                frame = requestAnimationFrame(() => manager.fitActive());
            });
            observer.observe(host);
            return () => {
                observer.disconnect();
                cancelAnimationFrame(frame);
            };
        }, []);

        const shells = connection.info?.shells ?? [];
        let message = null;
        if (!config.token) message = <SetupView t={t} />;
        else if (sessions.length === 0 && connection.status === 'unreachable') message = <ProblemView t={t} manager={manager} config={config} kind="unreachable" />;
        else if (sessions.length === 0 && connection.status === 'auth-failed') message = <ProblemView t={t} manager={manager} config={config} kind="auth" />;
        else if (sessions.length === 0) message = <div className="kt-message"><p>{t('connecting')}</p></div>;

        return (
            <div ref={rootRef} className="kt-panel pointer-events-auto no-drag-region" style={placement(edge, PANEL_SIZES[config.size])}>
                <div className="kt-header">
                    <div className="kt-title">
                        <Icon name="terminal" />
                        <span>{t('title')}</span>
                    </div>
                    <div className="kt-tabs" role="tablist" aria-label={t('title')}>
                        {sessions.map((session) => (
                            <div key={session.id} className="kt-tab" role="presentation" data-active={session.id === manager.activeId}>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={session.id === manager.activeId}
                                    className="kt-tab-main"
                                    title={session.title}
                                    onClick={() => manager.activate(session.id)}
                                >
                                    <span className="kt-dot" data-status={session.status} />
                                    <span>{session.title}</span>
                                </button>
                                <button
                                    type="button"
                                    className="kt-icon-btn kt-small"
                                    aria-label={`${t('closeTab')}: ${session.title}`}
                                    title={t('closeTab')}
                                    onClick={() => manager.closeSession(session.id)}
                                >
                                    <Icon name="close" />
                                </button>
                            </div>
                        ))}
                    </div>
                    {config.token ? (
                        <button type="button" className="kt-icon-btn" aria-label={t('newTab')} title={t('newTab')} onClick={() => manager.createSession()}>
                            <Icon name="add" />
                        </button>
                    ) : null}
                    {config.token && shells.length > 1 ? (
                        <label className="kt-shell-picker" title={t('newTabWith')}>
                            <Icon name="expand_more" />
                            <select
                                className="kt-shell-select"
                                aria-label={t('newTabWith')}
                                value=""
                                onChange={(event) => {
                                    if (event.target.value) manager.createSession(event.target.value);
                                }}
                            >
                                <option value="">{t('newTabWith')}</option>
                                {shells.map((shell) => (
                                    <option key={shell.id} value={shell.id}>{shell.name}</option>
                                ))}
                            </select>
                        </label>
                    ) : null}
                    <button type="button" className="kt-icon-btn" aria-label={t('openSettings')} title={t('openSettings')} onClick={openSettings}>
                        <Icon name="settings" />
                    </button>
                    <button type="button" className="kt-icon-btn" aria-label={t('closePanel')} title={t('closePanel')} onClick={onClose}>
                        <Icon name="close" />
                    </button>
                </div>
                <div className="kt-body">
                    {message}
                    <div ref={hostRef} style={{ display: message ? 'none' : 'block', width: '100%', height: '100%' }} />
                </div>
            </div>
        );
    };
}
