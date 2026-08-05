import cors from 'cors';
import express, { type Express } from 'express';

import { config } from './config.ts';
import { withErrorHandling, withNotFound } from './http/middleware/error-handler.ts';
import { withRequestLog } from './http/middleware/request-log.ts';
import { withSecurityHeaders } from './http/middleware/security-headers.ts';
import { withRequestContext } from './http/request-context.ts';
import { createApiRouter } from './routes/index.ts';
import type { RunStore } from './runs/index.ts';

/**
 * Assembles the Express app. Separate from `server.ts` so a test can mount the
 * whole thing against a fresh store without binding a port.
 *
 * Reading the `use` calls top to bottom is the order a request passes through:
 *
 *   context → security headers → CORS → log → JSON body → routes → 404 → errors
 *
 * Two orderings are load-bearing. The request context goes first so the error
 * handler always has an id to report, and the error handler goes last so it
 * catches everything the routes throw — including, in Express 5, a rejected
 * promise from an async handler.
 */
export function createApp(store: RunStore): Express {
  const app = express();

  // Express advertises itself and trusts no proxy by default; we want neither
  // the advert nor a guess about proxy headers in a local-first app.
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use(withRequestContext());
  app.use(withSecurityHeaders());

  // In dev the Vite server proxies `/api`, so the browser sees one origin and
  // this never fires. It's here for running the web app against an API on
  // another host. An allowlist rather than `*`, so enabling it is never an
  // accident — `last-event-id` is allowed through for SSE resume.
  if (config.corsOrigins.length > 0) {
    app.use(
      cors({
        origin: config.corsOrigins,
        allowedHeaders: ['content-type', 'last-event-id', 'x-client-request-id'],
        exposedHeaders: ['x-request-id'],
        maxAge: 600,
      }),
    );
  }

  app.use(withRequestLog());

  // A 1000-node graph of 2KB configs is comfortably inside this. Oversized and
  // malformed bodies throw, and `toHttpError` translates them into the same
  // envelope as everything else.
  app.use(express.json({ limit: config.maxBodyBytes }));

  app.use('/api', createApiRouter(store));

  app.use(withNotFound());
  app.use(withErrorHandling());

  return app;
}
