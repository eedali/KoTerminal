// KoTerminal for KoBar. Every registration below runs synchronously at the top level of the script (KoBar attributes
// registrations to the running script), under one id for the button, the panel and the settings panel.
import { CODE_VERSION, PLUGIN_ID } from './id.js';
import { currentLanguage, translate } from './i18n.js';
import { readConfig } from './config.js';
import { createManager } from './manager.js';
import { createSettingsPanel } from './SettingsPanel.jsx';
import { injectStyles } from './styles.js';
import { createTerminalPanel } from './TerminalPanel.jsx';
import { createXterm } from './terminal.js';

const { KoBarExtensions, useAppStore } = window;

injectStyles();

// One manager per plugin id for the whole window lifetime: a re-run of this script (workspace switch, re-enable)
// reuses the running terminals. A manager from an older plugin version is closed and replaced.
const registry = (window.__koTerminal ??= {});
let manager = registry[PLUGIN_ID]?.codeVersion === CODE_VERSION ? registry[PLUGIN_ID].manager : null;
if (!manager) {
    registry[PLUGIN_ID]?.manager?.disposeAll?.();
    manager = createManager({
        getConfig: readConfig,
        createTerminal: createXterm,
        isRegistered: () => Boolean(KoBarExtensions.getPanel?.(PLUGIN_ID)),
    });
    registry[PLUGIN_ID] = { codeVersion: CODE_VERSION, manager };
}

const TerminalPanel = createTerminalPanel(manager);
const SettingsPanel = createSettingsPanel(manager);

KoBarExtensions.registerSidebarButton({
    id: PLUGIN_ID,
    icon: 'terminal',
    label: translate(currentLanguage(), 'name'),
    tile: { template: 'value-caption', sensitive: false },
    onClick: (_event, anchorRect) => {
        const store = useAppStore.getState();
        const isOpen = store.activeExtensionPanelId === PLUGIN_ID;
        store.closeAllUtilityPopups();
        if (!isOpen) useAppStore.setState({ activeExtensionPanelId: PLUGIN_ID, activeExtensionAnchorRect: anchorRect });
    },
});

// Bar tile: how many terminals are open. Feature-detected; old hosts without the tile API keep the plain icon button.
const pushTile = () => {
    if (typeof KoBarExtensions.setBarItemState !== 'function') return;
    try {
        const t = (key, vars) => translate(currentLanguage(), key, vars);
        const count = manager.sessions.length;
        const offline = Boolean(readConfig().token) && count === 0 && ['unreachable', 'auth-failed'].includes(manager.connection.status);
        KoBarExtensions.setBarItemState(PLUGIN_ID, {
            label: offline ? t('tileLabelOffline') : count > 0 ? t('tileLabelOpen', { count }) : t('tileLabelNone'),
            caption: t('tileCaption'),
            value: count > 0 ? String(count) : '–',
            sub: t('tileSub'),
            tone: offline ? 'error' : 'default',
        });
    } catch {
        // The tile is decoration; never let it break the plugin.
    }
};
if (typeof KoBarExtensions.setBarItemState === 'function') {
    pushTile();
    manager.subscribe(pushTile);
    let lastLanguage = currentLanguage();
    useAppStore.subscribe(() => {
        const language = currentLanguage();
        if (language !== lastLanguage) {
            lastLanguage = language;
            pushTile();
        }
    });
    if (typeof KoBarExtensions.onBarItemChange === 'function') KoBarExtensions.onBarItemChange(PLUGIN_ID, pushTile);
}

KoBarExtensions.registerPanel(PLUGIN_ID, { id: PLUGIN_ID, render: (props) => <TerminalPanel {...props} /> });
KoBarExtensions.registerSettingsPanel(PLUGIN_ID, { id: PLUGIN_ID, render: () => <SettingsPanel /> });
