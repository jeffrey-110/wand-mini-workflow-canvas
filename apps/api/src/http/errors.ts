import type { ApiErrorCode, ValidationIssue } from '@repo/types';
import { ParseError } from '@repo/workflow';

/**
 * Error taxonomy.
 *
 * Every failure path converges on `HttpError`, so the error middleware has
 * exactly one shape to deal with: a status, a stable machine-readable code, and
 * a message that is safe to show a user.
 *
 * Domain and framework errors are translated here rather than at each throw
 * site. That's what keeps `runs/` unaware of HTTP — the scheduler never needs
 * to know what a 422 is — and it's the only place that knows what Express's
 * body parser throws.
 */
export class HttpError extends Error {
  // Assigned in the body rather than as constructor parameter properties: those
  // emit code rather than erasing, and Node's --experimental-strip-types (which
  // `pnpm dev` runs on) rejects them outright. Everything here stays erasable.
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Only set for `invalid_workflow`, so the editor can list what to fix. */
  readonly issues: ValidationIssue[] | undefined;

  constructor(status: number, code: ApiErrorCode, message: string, issues?: ValidationIssue[]) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/** A graph that parsed but isn't runnable. 422, because the syntax was fine. */
export function invalidWorkflow(issues: ValidationIssue[]): HttpError {
  const errors = issues.filter((issue) => issue.severity === 'error');
  return new HttpError(422, 'invalid_workflow', `This workflow has ${errors.length} error${errors.length === 1 ? '' : 's'} that must be fixed before it can run.`, issues);
}

/**
 * Map anything thrown during a request onto an `HttpError`. Unrecognised errors
 * become a generic 500 on purpose — an internal message could leak file paths
 * or implementation details to the client.
 */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  // A parse failure is the client's fault, and its message names the exact path
  // that was wrong — genuinely useful to whoever is holding the API.
  if (error instanceof ParseError) return new HttpError(400, 'malformed_request', error.message);

  // `express.json()` throws these. Translated here rather than caught at the
  // route, so every route gets the same answer for the same mistake.
  const bodyParserType = (error as { type?: string } | null)?.type;
  if (bodyParserType === 'entity.too.large') {
    return new HttpError(413, 'body_too_large', 'Request body is too large.');
  }
  if (bodyParserType === 'entity.parse.failed') {
    return new HttpError(400, 'malformed_request', 'Request body is not valid JSON.');
  }

  return new HttpError(500, 'internal_error', 'Something went wrong handling this request.');
}
