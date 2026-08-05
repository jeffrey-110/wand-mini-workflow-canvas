import { Router } from 'express';

import type { HealthResponse } from '@repo/types';

import type { RunStore } from '../runs/index.ts';
import { runEventsHandler } from './run-events.ts';
import { cancelRunHandler, createRunHandler, getRunHandler } from './runs.ts';
import { validateWorkflowHandler } from './workflows.ts';

/**
 * The API contract, on one screen.
 *
 * | Method | Path                     | Purpose                                  |
 * | ------ | ------------------------ | ---------------------------------------- |
 * | GET    | /api/health              | Liveness, plus the active run count      |
 * | POST   | /api/workflows/validate  | Validate a graph without running it      |
 * | POST   | /api/runs                | Validate + accept a run → 201 { runId }  |
 * | GET    | /api/runs/:runId         | Point-in-time snapshot (reload recovery) |
 * | GET    | /api/runs/:runId/events  | SSE stream, resumable via Last-Event-ID  |
 * | POST   | /api/runs/:runId/cancel  | Request cancellation → 202               |
 *
 * The store is passed in rather than imported as a module singleton, so a test
 * can mount this router against a fresh store with no global state to reset.
 */
export function createApiRouter(store: RunStore): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const payload: HealthResponse = { ok: true, activeRuns: store.activeCount };
    res.json(payload);
  });

  router.post('/workflows/validate', validateWorkflowHandler());

  router.post('/runs', createRunHandler(store));
  router.get('/runs/:runId', getRunHandler(store));
  router.get('/runs/:runId/events', runEventsHandler(store));
  router.post('/runs/:runId/cancel', cancelRunHandler(store));

  return router;
}
