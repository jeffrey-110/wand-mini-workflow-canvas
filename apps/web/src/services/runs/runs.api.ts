import type { CancelRunResponse, CreateRunResponse, RunOptions, RunSnapshot, Workflow } from '@repo/types';

import { request } from '../api.ts';

export async function createRun(workflow: Workflow, options?: Partial<RunOptions>): Promise<CreateRunResponse> {
  return request<CreateRunResponse>('/api/runs', {
    method: 'POST',
    body: JSON.stringify({ workflow, options }),
  });
}

export async function getRun(runId: string): Promise<RunSnapshot> {
  return request<RunSnapshot>(`/api/runs/${encodeURIComponent(runId)}`);
}

export async function cancelRun(runId: string): Promise<CancelRunResponse> {
  return request<CancelRunResponse>(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
}
