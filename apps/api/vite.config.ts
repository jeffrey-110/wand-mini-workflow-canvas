import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * Bundles the server to `dist/server.js` so `pnpm start` runs plain JavaScript
 * with no type-stripping flag and no workspace resolution at runtime — the
 * @repo/* packages are consumed as source, so they have to be bundled in.
 */
export default defineConfig({
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/server.ts', import.meta.url)),
      output: { entryFileNames: 'server.js', format: 'esm' },
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    },
  },
});
