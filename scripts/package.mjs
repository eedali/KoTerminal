// Builds release/KoTerminal-<version>.zip: the files KoBar installs (manifest.json at the ZIP root plus the built entry)
// and the README and licence. Attach the ZIP to the GitHub release whose tag equals the manifest version (v1.0.0).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error(`manifest.json (${manifest.version}) and package.json (${pkg.version}) disagree.`);
if (!fs.existsSync(path.join(root, manifest.entry))) throw new Error(`Missing ${manifest.entry}: run npm run build first.`);

const files = ['manifest.json', manifest.entry, 'README.md', 'LICENSE'];
const entries = {};
for (const file of files) entries[file] = [fs.readFileSync(path.join(root, file)), { mtime: new Date('2026-01-01T00:00:00Z') }];

const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `KoTerminal-${manifest.version}.zip`);
fs.writeFileSync(out, zipSync(entries, { level: 9 }));
console.log(`${path.relative(root, out)} (${files.join(', ')})`);
