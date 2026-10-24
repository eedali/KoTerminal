// Builds dist/index.js: one IIFE file that KoBar injects as a classic script. React comes from window.React (JSX is
// compiled to window.React.createElement); xterm.js and its CSS are bundled. Run: node build.mjs
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

await build({
    root,
    logLevel: 'warn',
    build: {
        lib: { entry: path.join(root, 'src', 'index.jsx'), name: 'KoTerminal', formats: ['iife'], fileName: () => 'index.js' },
        outDir: path.join(root, 'dist'),
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        target: 'chrome120',
        rollupOptions: {
            external: ['react', 'react-dom'],
            output: { globals: { react: 'window.React', 'react-dom': 'window.ReactDOM' } },
        },
    },
    esbuild: { jsxFactory: 'window.React.createElement', jsxFragment: 'window.React.Fragment' },
});

console.log('Built dist/index.js');
