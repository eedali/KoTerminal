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
    onClick: (_event, anchorRect) => {
        const store = useAppStore.getState();
        const isOpen = store.activeExtensionPanelId === PLUGIN_ID;
        store.closeAllUtilityPopups();
        if (!isOpen) useAppStore.setState({ activeExtensionPanelId: PLUGIN_ID, activeExtensionAnchorRect: anchorRect });
    },
});

KoBarExtensions.registerPanel(PLUGIN_ID, { id: PLUGIN_ID, render: (props) => <TerminalPanel {...props} /> });
KoBarExtensions.registerSettingsPanel(PLUGIN_ID, { id: PLUGIN_ID, render: () => <SettingsPanel /> });
