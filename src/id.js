// KoBar runs the bundle as <script data-extension-id="<id>">; the id is readable only during that first, synchronous
// run. It is the manifest id, or `dev-<manifest id>` when the plugin is loaded from KoBar's pluginsPlayground.
export const MANIFEST_ID = 'com.eedali.koterminal';

export const PLUGIN_ID = (typeof document !== 'undefined' && document.currentScript?.dataset?.extensionId) || MANIFEST_ID;

/** Bumped when the module-level session manager changes shape; an older live manager is then replaced. */
export const CODE_VERSION = '1.0.0';
