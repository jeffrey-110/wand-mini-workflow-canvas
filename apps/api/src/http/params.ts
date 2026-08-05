import type { Request } from 'express';

/**
 * Read a single path parameter.
 *
 * Express 5 types `req.params` values as `string | string[] | undefined`,
 * because a route *can* declare a repeated parameter. None of ours do, so this
 * narrows in one place rather than casting at every call site — and the
 * `undefined` it returns for the array case is handled by the caller's existing
 * "no such run" path, which is the right answer for a URL that shape anyway.
 */
export function pathParam(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === 'string' ? value : undefined;
}
