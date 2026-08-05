import type { RequestHandler } from 'express';

import type { ValidateResponse } from '@repo/types';
import { parseWorkflow, validateWorkflow } from '@repo/workflow';

/**
 * `POST /api/workflows/validate` — check a graph without running it.
 *
 * The editor does *not* call this on every keystroke; it runs `@repo/workflow`
 * locally instead, because a network round trip per edit would make the
 * connection guard feel laggy and it is literally the same code either way.
 * This endpoint exists so the rules are reachable by anything that isn't a JS
 * client, and so "is my graph valid" has an answer that doesn't involve
 * starting a run. The authoritative check is still the one inside
 * `POST /api/runs`.
 */
export function validateWorkflowHandler(): RequestHandler {
  return (req, res) => {
    const body = req.body as Record<string, unknown>;

    // Accept both `{ workflow: {...} }` and a bare workflow: the former matches
    // the create-run body, the latter is what anyone reaching for curl types.
    const payload = 'workflow' in body ? body.workflow : body;

    const result: ValidateResponse = validateWorkflow(parseWorkflow(payload));
    res.json(result);
  };
}
