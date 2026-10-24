#!/usr/bin/env node
// KoTerminal bridge command line. Run `node src/cli.js --help`.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installAutostart, removeAutostart } from './autostart.js';
import { configDir, loadOrCreateConfig } from './config.js';
import { createBridgeServer } from './server.js';
import { detectShells } from './shells.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const HELP = `KoTerminal bridge ${version}
Runs local shells for the KoTerminal plugin in KoBar. Listens on 127.0.0.1 only.

Usage: node src/cli.js [option]
  (no option)           start the bridge
  --port <n>            listen on another port for this run (default from bridge.json, 47011)
  --show-token          print the pairing token and exit
  --rotate-token        create a new pairing token, print it and exit (pair KoTerminal again)
  --install-autostart   Windows: start the bridge hidden at login
  --remove-autostart    Windows: undo --install-autostart
  --help                this text

Config: ${path.join(configDir(), 'bridge.json')}`;

function printToken(token) {
    console.log('\nPairing token (paste it into KoBar > Settings > Plugins > KoTerminal settings):\n');
    console.log(`    ${token}\n`);
    console.log('Keep it private: anyone with this token can run commands as you on this computer.\n');
}

async function main(argv) {
    const args = new Set(argv);
    if (args.has('--help') || args.has('-h')) return console.log(HELP);

    if (args.has('--install-autostart')) {
        const result = installAutostart({ nodePath: process.execPath, cliPath: fileURLToPath(import.meta.url) });
        if (!result.ok) return fail('Autostart is automated on Windows only. On macOS/Linux add `node src/cli.js` to your login items.');
        return console.log(`Autostart installed: ${result.file}\nThe bridge now starts hidden when you log in.`);
    }
    if (args.has('--remove-autostart')) {
        const result = removeAutostart();
        if (!result.ok) return fail('Autostart is automated on Windows only.');
        return console.log(result.removed ? `Autostart removed: ${result.file}` : 'Autostart was not installed.');
    }

    const { config, file, created, rotated } = loadOrCreateConfig({ rotateToken: args.has('--rotate-token') });
    if (args.has('--show-token') || rotated) return printToken(config.token);

    const portIndex = argv.indexOf('--port');
    const port = portIndex >= 0 ? Number(argv[portIndex + 1]) : config.port;
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return fail('--port needs a number between 1024 and 65535.');

    const shells = detectShells();
    if (shells.length === 0) return fail('No shell found on this system.');
    const { spawn } = await import('node-pty');
    const bridge = createBridgeServer({ config: { ...config, port }, shells, spawn, version });
    try {
        await bridge.listen(port);
    } catch (err) {
        if (err?.code === 'EADDRINUSE') return fail(`Port ${port} is already in use. Is the bridge already running?`);
        throw err;
    }

    console.log(`KoTerminal bridge ${version} listening on 127.0.0.1:${port}`);
    console.log(`Shells: ${shells.map((s) => s.name).join(', ')}`);
    console.log(`Config: ${file}`);
    if (created) printToken(config.token);
    else console.log('Pairing token: run `npm run token` to show it.');
    console.log('Press Ctrl+C to stop.');

    const stop = async () => {
        await bridge.close();
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
});
