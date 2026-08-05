import type { RequestHandler } from 'express';

import { log } from '../../logger.ts';

/**
 * One line per completed request.
 *
 * Logged on the response finishing rather than after `next()`, because the SSE
 * route returns while its response is still open — timing it at `next()` would
 * report a multi-minute stream as a 0ms request and would miss the status code
 * entirely.
 */
export function withRequestLog(): RequestHandler {
  return (req, res, next) => {
    res.once('finish', () => {
      log.info('request', {
        requestId: req.requestId,
        method: req.method,
        // `originalUrl`, not `path`: inside a mounted Router the latter is
        // relative, so /api/runs/x would log as /runs/x.
        path: req.originalUrl,
        status: res.statusCode,
        ms: Math.round(performance.now() - req.startedAt),
      });
    });

    next();
  };
}
