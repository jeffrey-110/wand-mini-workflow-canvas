import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * This suite exists because of a specific bug. The SSE stream carried an
 * `event:` line, which is well-formed SSE and looked flawless under `curl -N`,
 * but it makes `EventSource` dispatch a *typed* event that never reaches an
 * `onmessage` handler. Every server test passed while the browser received
 * nothing. No unit test could have caught it: the defect lived in the seam
 * between a correct server and a correct client. That seam is the only thing
 * worth paying for a browser to cover, and it is what these tests cover.
 *
 * **Its own workspace, depending on neither app.** It talks to the running
 * system over HTTP exactly as a user's browser does. Importing from `@repo/web`
 * would let a test assert against the same constant the app renders from, which
 * proves nothing; and importing from `@repo/workflow` would let validation
 * expectations drift in lockstep with the rules they are meant to pin.
 *
 * **Headed by default.** A run is a thing you watch, and a suite you can watch
 * is a suite you can debug. Set `PLAYWRIGHT_HEADLESS=1` for CI.
 *
 * **Both servers, on their real ports.** The proxy is part of what's under
 * test: the browser talks to Vite, which forwards `/api` to the API, so the
 * stream crosses the proxy exactly as it does in development. The ports are the
 * repo's declared ones and nothing here moves them — a suite that quietly runs
 * somewhere else is not testing the thing you ship. If a port is taken, this
 * fails loudly, which is the same choice `vite.config.ts` makes with
 * `strictPort`.
 */

const WEB_ORIGIN = 'http://localhost:5173';
const API_ORIGIN = 'http://127.0.0.1:8787';

export default defineConfig({
  testDir: './tests',
  // Every spec drives one shared API. Serial keeps the headed window readable,
  // and keeps a slow machine from turning timing assertions into flakes.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: WEB_ORIGIN,
    headless: process.env.PLAYWRIGHT_HEADLESS === '1',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Not `pnpm dev`: that runs under `--watch`, and a restart mid-suite
      // would drop every in-flight run and the event log with it.
      command: 'node --experimental-strip-types src/server.ts',
      cwd: '../api',
      url: `${API_ORIGIN}/api/health`,
      // Never inherit a server this suite didn't start. A dev server left
      // running from an older config is how this suite first failed: every
      // POST came back 404 because that server had no `/api` proxy.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // Steps long enough to observe two branches running at once, short
        // enough that the whole suite takes seconds. The gap between them is
        // what the concurrency assertion reads.
        RUN_MIN_DURATION_MS: '400',
        RUN_MAX_DURATION_MS: '700',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'pnpm dev',
      cwd: '../web',
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
