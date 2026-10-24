import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { installAutostart, removeAutostart, startupScript } from '../src/autostart.js';
import { DEFAULT_PORT, configDir, loadOrCreateConfig, normaliseConfig } from '../src/config.js';
import { MAX_INPUT_CHARS, parseClientMessage } from '../src/protocol.js';
import { isAllowedHost, isAllowedOrigin, tokensEqual } from '../src/security.js';
import { describeShells, detectShells, pickShell } from '../src/shells.js';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'koterminal-test-'));

describe('config', () => {
    it('creates bridge.json with a long random token on first run, then reuses it', () => {
        const dir = tempDir();
        const first = loadOrCreateConfig({ dir });
        assert.equal(first.created, true);
        assert.equal(first.config.port, DEFAULT_PORT);
        assert.ok(first.config.token.length >= 40);
        const second = loadOrCreateConfig({ dir });
        assert.equal(second.created, false);
        assert.equal(second.config.token, first.config.token);
        if (process.platform !== 'win32') assert.equal(fs.statSync(first.file).mode & 0o777, 0o600);
    });

    it('rotates the token but keeps the port', () => {
        const dir = tempDir();
        const first = loadOrCreateConfig({ dir });
        fs.writeFileSync(first.file, JSON.stringify({ ...first.config, port: 48000 }));
        const rotated = loadOrCreateConfig({ dir, rotateToken: true });
        assert.equal(rotated.rotated, true);
        assert.notEqual(rotated.config.token, first.config.token);
        assert.equal(rotated.config.port, 48000);
    });

    it('refuses damaged files with a readable message', () => {
        const dir = tempDir();
        fs.writeFileSync(path.join(dir, 'bridge.json'), '{not json');
        assert.throws(() => loadOrCreateConfig({ dir }), /not valid JSON/);
        assert.throws(() => normaliseConfig({ token: 'short' }), /no valid token/);
        assert.throws(() => normaliseConfig({ token: 'x'.repeat(40), port: 80 }), /invalid port/);
        assert.deepEqual(normaliseConfig({ token: 'x'.repeat(40), allowedOrigins: ['a', 3] }).allowedOrigins, ['a']);
    });

    it('puts the config in the per-user app data folder', () => {
        // Windows: the machine-local folder, never the roaming profile.
        assert.equal(
            configDir({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, home: 'C:\\Users\\u' }),
            path.join('C:\\Users\\u\\AppData\\Local', 'KoTerminal')
        );
        assert.equal(configDir({ platform: 'darwin', env: {}, home: '/Users/u' }), path.join('/Users/u', 'Library', 'Application Support', 'KoTerminal'));
        assert.equal(configDir({ platform: 'linux', env: { KOTERMINAL_CONFIG_DIR: '/x' }, home: '/h' }), '/x');
    });
});

describe('security', () => {
    it('accepts only the loopback host names with the right port', () => {
        assert.equal(isAllowedHost('127.0.0.1:47011', 47011), true);
        assert.equal(isAllowedHost('LOCALHOST:47011', 47011), true);
        assert.equal(isAllowedHost('127.0.0.1:47012', 47011), false);
        assert.equal(isAllowedHost('evil.example:47011', 47011), false);
        assert.equal(isAllowedHost(undefined, 47011), false);
    });

    it('accepts packaged KoBar (file://) and local clients; everything else only when configured', () => {
        for (const origin of ['file://', 'FILE://', undefined]) assert.equal(isAllowedOrigin(origin), true, String(origin));
        // `null` is what sandboxed iframes on any website send; the KoBar dev server needs an explicit opt-in.
        for (const origin of ['null', 'http://localhost:5173', 'https://evil.example', '']) assert.equal(isAllowedOrigin(origin), false, origin);
        assert.equal(isAllowedOrigin('http://localhost:5173', ['http://localhost:5173']), true);
    });

    it('compares tokens exactly', () => {
        assert.equal(tokensEqual('abc', 'abc'), true);
        assert.equal(tokensEqual('abd', 'abc'), false);
        assert.equal(tokensEqual('', 'abc'), false);
        assert.equal(tokensEqual(undefined, 'abc'), false);
    });
});

describe('shells', () => {
    it('lists the Windows shells that exist, PowerShell 7 first', () => {
        const present = new Set([
            'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            'C:\\Windows\\System32\\cmd.exe',
        ]);
        const shells = detectShells({ platform: 'win32', env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' }, exists: (p) => present.has(p) });
        assert.deepEqual(shells.map((s) => s.id), ['pwsh', 'powershell', 'cmd']);
        assert.deepEqual(describeShells(shells)[0], { id: 'pwsh', name: 'PowerShell 7' });
    });

    it('puts $SHELL first on macOS/Linux and drops duplicates', () => {
        const shells = detectShells({ platform: 'darwin', env: { SHELL: '/bin/zsh' }, exists: (p) => ['/bin/zsh', '/bin/bash'].includes(p) });
        assert.deepEqual(shells.map((s) => s.id), ['zsh', 'bash']);
        assert.deepEqual(shells[0].args, ['-l']);
    });

    it('picks the requested shell or the default', () => {
        const shells = [{ id: 'a' }, { id: 'b' }];
        assert.equal(pickShell(shells, 'b').id, 'b');
        assert.equal(pickShell(shells, 'zzz').id, 'a');
        assert.equal(pickShell([], 'a'), null);
    });
});

describe('protocol', () => {
    it('parses and clamps messages', () => {
        assert.deepEqual(parseClientMessage('{"type":"auth","token":"t"}'), { ok: true, message: { type: 'auth', token: 't' } });
        assert.deepEqual(parseClientMessage('{"type":"resize","cols":9999,"rows":-3}').message, { type: 'resize', cols: 500, rows: 2 });
        assert.deepEqual(parseClientMessage('{"type":"open"}').message, { type: 'open', shell: undefined, cols: 80, rows: 24, cwd: undefined });
        assert.equal(parseClientMessage('{"type":"input","data":"ls\\r"}').message.data, 'ls\r');
    });

    it('rejects anything else as fatal', () => {
        for (const frame of ['nope', '{}', '{"type":"auth"}', '{"type":"exec","cmd":"x"}', '{"type":"input","data":5}']) {
            const parsed = parseClientMessage(frame);
            assert.equal(parsed.ok, false, frame);
            assert.equal(parsed.fatal, true, frame);
        }
    });

    it('refuses oversized input without ending the session', () => {
        const parsed = parseClientMessage(JSON.stringify({ type: 'input', data: 'x'.repeat(MAX_INPUT_CHARS + 1) }));
        assert.deepEqual([parsed.ok, parsed.fatal], [false, false]);
    });
});

describe('autostart', () => {
    it('writes a hidden-window VBScript that quotes both paths', () => {
        const script = startupScript('C:\\Program Files\\nodejs\\node.exe', 'C:\\KoTerminal\\bridge\\src\\cli.js');
        assert.match(script, /shell\.Run """" & "C:\\Program Files\\nodejs\\node\.exe" & """ """ & "C:\\KoTerminal\\bridge\\src\\cli\.js" & """", 0, False/);
    });

    it('installs into and removes from the Startup folder (Windows only), as UTF-16LE so Turkish paths survive', () => {
        const appData = tempDir();
        const env = { APPDATA: appData };
        const cliPath = 'C:\\Users\\Çağrı Şİşli\\KoTerminal\\bridge\\src\\cli.js';
        const installed = installAutostart({ nodePath: 'C:\\Program Files\\nodejs\\node.exe', cliPath, env, platform: 'win32' });
        assert.equal(installed.ok, true);
        const bytes = fs.readFileSync(installed.file);
        assert.deepEqual([bytes[0], bytes[1]], [0xff, 0xfe], 'UTF-16LE byte order mark');
        assert.ok(bytes.toString('utf16le').includes(cliPath));
        assert.equal(removeAutostart({ env, platform: 'win32' }).removed, true);
        assert.equal(fs.existsSync(installed.file), false);
        assert.equal(installAutostart({ nodePath: 'n', cliPath: 'c', env, platform: 'darwin' }).ok, false);
    });
});
