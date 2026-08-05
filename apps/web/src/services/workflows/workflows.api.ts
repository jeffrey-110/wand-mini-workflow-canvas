import type { ValidateResponse, Workflow } from '@repo/types';

import { request } from '../api.ts';

/**
 * Server-side validation.
 *
 * The editor does not call this per keystroke — it runs `@repo/workflow`
 * locally for that, since a round trip per edit would make the connection guard
 * feel laggy and it is literally the same code. This exists for an explicit
 * "check my graph" without starting a run, and it's what a non-JS client would
 * use. See `hooks/useValidation.ts` for the reasoning in full.
 */
export async function validateWorkflow(workflow: Workflow, signal?: AbortSignal): Promise<ValidateResponse> {
  return request<ValidateResponse>('/api/workflows/validate', {
    method: 'POST',
    body: JSON.stringify({ workflow }),
    ...(signal ? { signal } : {}),
  });
}
