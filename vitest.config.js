import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsxFactory: 'window.React.createElement', jsxFragment: 'window.React.Fragment' },
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
    },
});
