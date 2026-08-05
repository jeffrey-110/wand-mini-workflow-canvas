import type { RequestHandler } from 'express';

/**
 * The handful of headers that cost nothing and close off whole categories of
 * mistake. This is a JSON + SSE API with no cookies and no HTML, so the list is
 * short on purpose — a CSP here would be theatre, and `helmet` would be a
 * dependency for four `setHeader` calls.
 */
export function withSecurityHeaders(): RequestHandler {
  return (_req, res, next) => {
    // Stops a browser second-guessing our content-type, which is the vector
    // that turns a JSON echo into stored XSS.
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    // Nothing here is meant to be framed.
    res.setHeader('x-frame-options', 'DENY');
    // Express advertises itself by default; there's no reason to.
    res.removeHeader('x-powered-by');

    next();
  };
}
