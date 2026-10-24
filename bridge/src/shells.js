// The shells the bridge offers. Clients choose by id; they can never pass an executable path.
import * as nodeFs from 'node:fs';
import * as path from 'node:path';

function windowsShells(env, exists) {
    const systemRoot = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const system32 = path.win32.join(systemRoot, 'System32');
    const candidates = [
        { id: 'pwsh', name: 'PowerShell 7', file: path.win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'), args: ['-NoLogo'] },
        {
            id: 'powershell',
            name: 'Windows PowerShell',
            file: path.win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
            args: ['-NoLogo'],
        },
        { id: 'cmd', name: 'Command Prompt', file: env.ComSpec || path.win32.join(system32, 'cmd.exe'), args: [] },
        { id: 'git-bash', name: 'Git Bash', file: path.win32.join(programFiles, 'Git', 'bin', 'bash.exe'), args: ['--login', '-i'] },
        { id: 'wsl', name: 'WSL', file: path.win32.join(system32, 'wsl.exe'), args: [] },
    ];
    return candidates.filter((shell) => exists(shell.file));
}

function posixShells(env, exists) {
    const list = [];
    const seen = new Set();
    const add = (file) => {
        if (!file || seen.has(file) || !exists(file)) return;
        seen.add(file);
        const base = path.posix.basename(file);
        list.push({ id: base, name: base, file, args: ['-l'] });
    };
    add(env.SHELL);
    for (const file of ['/bin/zsh', '/bin/bash', '/usr/bin/fish', '/opt/homebrew/bin/fish', '/bin/sh']) add(file);
    return list;
}

/** `[{ id, name, file, args }]`, the default shell first. */
export function detectShells({ platform = process.platform, env = process.env, exists = (p) => nodeFs.existsSync(p) } = {}) {
    return platform === 'win32' ? windowsShells(env, exists) : posixShells(env, exists);
}

/** The shell for a requested id; the first (default) shell for an unknown or missing id. */
export function pickShell(shells, id) {
    return shells.find((shell) => shell.id === id) ?? shells[0] ?? null;
}

/** Public view of the list (no paths). */
export function describeShells(shells) {
    return shells.map(({ id, name }) => ({ id, name }));
}
