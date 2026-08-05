/** HTTP request and response bodies. One entry per endpoint, named after it. */

import type { Workflow } from './graph.ts';
import type { RunOptions, RunSnapshot } from './run.ts';
import type { ValidationIssue, ValidationResult } from './validation.ts';

/** `POST /api/workflows/validate` */
export interface ValidateRequest {
  workflow: Workflow;
}
export type ValidateResponse = ValidationResult;

/** `POST /api/runs` */
export interface CreateRunRequest {
  workflow: Workflow;
  options?: Partial<RunOptions>;
}
export interface CreateRunResponse {
  runId: string;
  /** State at creation, so the canvas can paint before the stream opens. */
  snapshot: RunSnapshot;
}

/** `POST /api/runs/:runId/cancel` */
export interface CancelRunResponse {
  runId: string;
  status: 'canceling';
}

/** `GET /api/health` */
export interface HealthResponse {
  ok: true;
  activeRuns: number;
}

/**
 * The one error envelope every failure converges on. `code` is stable and
 * machine-readable; `error` is safe to show a user; `requestId` is what they
 * quote in a bug report.
 */
export interface ApiError {
  error: string;
  code: ApiErrorCode;
  requestId: string;
  /** Present only on `invalid_workflow`, so the editor can list what to fix. */
  issues?: ValidationIssue[];
}

export type ApiErrorCode =
  | 'invalid_workflow'
  | 'malformed_request'
  | 'body_too_large'
  | 'run_not_found'
  | 'run_already_finished'
  | 'not_found'
  | 'method_not_allowed'
  | 'internal_error'
  | 'network_error'
  | 'timeout'
  | 'unknown_error';
