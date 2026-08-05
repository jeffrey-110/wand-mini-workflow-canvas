import { createServer } from 'node:http';

import { createApp } from './app.ts';
import { config } from './config.ts';
import { log } from './logger.ts';
import { RunStore } from './runs/index.ts';

/**
 * Composition root.
 *
 * This file owns the process lifecycle and nothing else — the app is assembled
 * in `app.ts`, and every route's logic lives under `routes/`. Wrapping the
 * Express app in an explicit `http.Server` rather than calling `app.listen()`
 * is what gives shutdown access to `closeIdleConnections()`, which matters here:
 * long-lived SSE connections are exactly the case a bare `close()` hangs on.
 */

export const store = new RunStore({ ttlMs: config.runTtlMs, maxRuns: config.maxRuns });
export const app = createApp(store);
export const server = createServer(app);

function shutdown(signal: string): void {
  log.info('shutting down', { signal, activeRuns: store.activeCount });

  const timer = setTimeout(() => {
    log.warn('forced exit after grace period');
    process.exit(1);
  }, config.shutdownGraceMs);
  timer.unref();

  // Aborts every in-flight run, which lets their streams emit `run.finished`
  // and close cleanly rather than being cut off mid-event.
  store.dispose();

  server.close((error) => {
    if (error) {
      log.error('shutdown error', { error: error.message });
      process.exit(1);
    }
    log.info('closed cleanly');
    process.exit(0);
  });
  server.closeIdleConnections();
}

// Only bind when run directly, so tests can import the app without a port.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  server.listen(config.port, config.host, () => {
    log.info('listening', {
      url: `http://${config.host}:${config.port}`,
      env: config.nodeEnv,
      failureRate: config.defaultRunOptions.failureRate,
    });
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => shutdown(signal));
  }
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled rejection', { error: String(reason) });
  });
}
