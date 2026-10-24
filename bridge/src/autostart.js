// Windows: start the bridge hidden at login with a small VBScript in the user's Startup folder (no admin rights, no
// registry). Other platforms: not automated yet; the caller prints manual instructions.
import * as nodeFs from 'node:fs';
import * as path from 'node:path';

export const STARTUP_FILE = 'KoTerminal Bridge.vbs';

export function startupFolder(env = process.env) {
    if (!env.APPDATA) throw new Error('APPDATA is not set.');
    return path.win32.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

const vbsString = (value) => '"' + String(value).replace(/"/g, '""') + '"';

/** VBScript that runs `"<node>" "<cli>"` with a hidden window and does not wait for it. */
export function startupScript(nodePath, cliPath) {
    const command = `"""" & ${vbsString(nodePath)} & """ """ & ${vbsString(cliPath)} & """"`;
    return [
        "' KoTerminal bridge: starts the local terminal bridge hidden at login. Remove with: npm run autostart:remove",
        'Set shell = CreateObject("WScript.Shell")',
        `shell.Run ${command}, 0, False`,
        '',
    ].join('\r\n');
}

export function installAutostart({ nodePath, cliPath, env = process.env, fs = nodeFs, platform = process.platform }) {
    if (platform !== 'win32') return { ok: false, reason: 'unsupported-platform' };
    const file = path.win32.join(startupFolder(env), STARTUP_FILE);
    fs.mkdirSync(path.win32.dirname(file), { recursive: true });
    // Windows Script Host reads BOM-less files in the ANSI code page and refuses UTF-8 with a BOM, so a path with
    // Ç, ğ, ş or İ would break. UTF-16LE with a BOM is read correctly.
    fs.writeFileSync(file, '﻿' + startupScript(nodePath, cliPath), 'utf16le');
    return { ok: true, file };
}

export function removeAutostart({ env = process.env, fs = nodeFs, platform = process.platform } = {}) {
    if (platform !== 'win32') return { ok: false, reason: 'unsupported-platform' };
    const file = path.win32.join(startupFolder(env), STARTUP_FILE);
    if (!fs.existsSync(file)) return { ok: true, file, removed: false };
    fs.rmSync(file);
    return { ok: true, file, removed: true };
}
