import type { ApiError, ApiErrorCode } from '@repo/types';

/**
 * `request` — the single function every service talks through.
 *
 * It normalizes every failure — HTTP error, network drop, abort — into one
 * tagged error shape, so callers never branch on `fetch` internals and the UI
 * always has a `code` to switch on and a message safe to render.
 *
 * Deliberately at the root of `services/` rather than nested: every entity
 * folder imports it, so it should be one hop away (`../api.ts`).
 */

/**
 * A plain `Error` carrying the fields the UI needs. Tagged by `name` rather
 * than modelled as a subclass: `instanceof` silently returns false when a
 * module is loaded twice (duplicate copies in a bundle, an HMR reload holding
 * an old copy), and this error is checked in exactly those places. The failure
 * would be silent — the error still surfaces, but the `code` is never consulted.
 */
export interface ApiRequestError extends Error {
  name: 'ApiRequestError';
  code: ApiErrorCode;
  /** 0 when the request never reached the server. */
  status: number;
  /** Server request id, for quoting in a bug report. Null when there was no response. */
  requestId: string | null;
  /** Present on `invalid_workflow`: the exact issues to fix. */
  issues: ApiError['issues'];
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof Error && error.name === 'ApiRequestError';
}

function apiRequestError(message: string, code: ApiErrorCode, status: number, requestId: string | null, issues?: ApiError['issues']): ApiRequestError {
  return Object.assign(new Error(message), {
    name: 'ApiRequestError' as const,
    code,
    status,
    requestId,
    issues,
  });
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw apiRequestError('Request canceled.', 'unknown_error', 0, null);
    }
    // "Server is down" and "server said no" need different copy in the UI, and
    // conflating them is a classic source of misleading error text.
    throw apiRequestError('Could not reach the workflow service. Is the API running?', 'network_error', 0, null);
  }

  const requestId = response.headers.get('x-request-id');

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw apiRequestError(body?.error ?? `Request failed (${response.status}).`, body?.code ?? 'unknown_error', response.status, body?.requestId ?? requestId, body?.issues);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
