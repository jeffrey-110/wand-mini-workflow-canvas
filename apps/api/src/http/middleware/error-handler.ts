import type { ErrorRequestHandler, RequestHandler } from 'express';

import type { ApiError } from '@repo/types';

import { log } from '../../logger.ts';
import { HttpError, toHttpError } from '../errors.ts';

/**
 * The terminal error middleware, registered last so nothing escapes it.
 *
 * Express 5 forwards a rejected promise from an async handler here
 * automatically, which is the main reason this app is on 5 rather than 4 — no
 * `asyncHandler` wrapper on every route, and no route that silently hangs
 * because someone forgot one.
 *
 * The `headersSent` guard is what makes this safe to have around the SSE route.
 * Once a stream has started there is no status code left to change, so the only
 * correct move is to log and destroy the socket — writing an error body into a
 * half-delivered event stream would corrupt the client's parse.
 */
export function withErrorHandling(): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const httpError = toHttpError(error);

    if (httpError.status >= 500) {
      log.error('request failed', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } else {
      log.debug('request rejected', { requestId: req.requestId, path: req.originalUrl, code: httpError.code });
    }

    if (res.headersSent) {
      res.destroy();
      return;
    }

    const payload: ApiError = {
      error: httpError.message,
      code: httpError.code,
      requestId: req.requestId ?? 'unknown',
      ...(httpError.issues ? { issues: httpError.issues } : {}),
    };
    res.status(httpError.status).json(payload);
  };
}

/**
 * Anything that reached the end of the routing table. Registered after the
 * routes and before the error handler, so a 404 travels the same path as every
 * other failure and comes back in the same envelope.
 */
export function withNotFound(): RequestHandler {
  return (req, _res, next) => {
    next(new HttpError(404, 'not_found', `No route matches ${req.method} ${req.originalUrl}.`));
  };
}
