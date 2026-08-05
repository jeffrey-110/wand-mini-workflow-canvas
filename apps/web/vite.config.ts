import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    // Fail loudly on a taken port instead of silently moving to 5174 — a
    // shifted port breaks the proxy assumption below and is easy to miss.
    strictPort: true,
    proxy: {
      // Same-origin in dev, so the SSE stream and the POSTs share a host and
      // there is no CORS story to get wrong. Vite streams proxied responses
      // through untouched, which is what the event stream needs.
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
