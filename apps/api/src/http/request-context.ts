import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Per-request bookkeeping, attached first so every later layer — including the
 * error handler — already has a request id to log and to put in the response.
 *
 * Declaration-merged onto Express's own `Request` rather than passed around in
 * `res.locals`: `res.locals` is typed `Record<string, any>`, which would make
 * `req.requestId` a silent `any` at every call site. This way a typo is a
 * compile error.
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startedAt: number;
    }
  }
}

const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id';
const REQUEST_ID_HEADER = 'x-request-id';

export function withRequestContext(): RequestHandler {
  return (req, res, next) => {
    // Honour a client-supplied id when there is one: that's what lets a user
    // quote an id from a request that timed out before a response came back.
    const supplied = req.get(CLIENT_REQUEST_ID_HEADER);
    req.requestId = supplied && supplied.length <= 100 ? supplied : randomUUID();
    req.startedAt = performance.now();

    // Set immediately, so it's present even on responses written by paths that
    // never look at the request again.
    res.setHeader(REQUEST_ID_HEADER, req.requestId);
    next();
  };
}
