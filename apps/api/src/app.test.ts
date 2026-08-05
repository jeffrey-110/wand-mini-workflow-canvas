import { cyclicWorkflow, diamondWorkflow, edge, linearWorkflow, node, workflow } from '@repo/factories';
import type { ApiError, CreateRunResponse, RunEvent, ValidateResponse, Workflow } from '@repo/types';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.ts';
import { RunStore } from './runs/index.ts';

/**
 * HTTP-level tests against the real app — routing, status codes, the error
 * envelope, and the SSE stream end to end.
 *
 * These replaced a set of unit tests for a hand-rolled router: mounting the
 * actual app costs the same to write and covers the thing that can really
 * break, which is the contract rather than the dispatch.
 */

let store: RunStore;
let app: Express;

beforeEach(() => {
  store = new RunStore({ ttlMs: 60_000, maxRuns: 100 });
  app = createApp(store);
});

afterEach(() => store.dispose());

/** Fast and deterministic — these tests are about HTTP, not about the dice. */
const FAST = { failureRate: 0, minDurationMs: 5, maxDurationMs: 15 };

async function startRun(graph: Workflow = linearWorkflow(), options: Record<string, unknown> = FAST): Promise<string> {
  const response = await request(app).post('/api/runs').send({ workflow: graph, options }).expect(201);
  return (response.body as CreateRunResponse).runId;
}

/** Collect an SSE response body into parsed events. */
function parseEvents(body: string): RunEvent[] {
  return body
    .split('\n\n')
    .map((frame) => frame.split('\n').find((line) => line.startsWith('data: ')))
    .filter((line): line is string => line !== undefined)
    .map((line) => JSON.parse(line.slice('data: '.length)) as RunEvent);
}

describe('GET /api/health', () => {
  it('reports liveness and the active run count', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body).toEqual({ ok: true, activeRuns: 0 });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('sets the security headers and does not advertise Express', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('POST /api/workflows/validate', () => {
  it('accepts a bare workflow as well as a wrapped one', async () => {
    const wrapped = await request(app).post('/api/workflows/validate').send({ workflow: linearWorkflow() }).expect(200);
    const bare = await request(app).post('/api/workflows/validate').send(linearWorkflow()).expect(200);

    expect((wrapped.body as ValidateResponse).valid).toBe(true);
    expect(bare.body).toEqual(wrapped.body);
  });

  it('returns issues without running anything', async () => {
    const response = await request(app).post('/api/workflows/validate').send({ workflow: cyclicWorkflow() }).expect(200);
    const body = response.body as ValidateResponse;

    expect(body.valid).toBe(false);
    expect(body.issues.map((issue) => issue.code)).toContain('CYCLE');
    expect(store.size).toBe(0);
  });
});

describe('POST /api/runs', () => {
  it('accepts a valid workflow and returns an id plus an initial snapshot', async () => {
    const response = await request(app).post('/api/runs').send({ workflow: diamondWorkflow(), options: FAST }).expect(201);
    const body = response.body as CreateRunResponse;

    expect(body.runId).toBeTruthy();
    expect(response.headers.location).toBe(`/api/runs/${body.runId}`);
    // Every node is present from the first response, so the canvas can paint
    // the queued state before the stream is even open.
    expect(Object.keys(body.snapshot.nodes).sort()).toEqual(['a', 'b', 'in', 'out']);
  });

  it('rejects an unrunnable graph with 422 and the issues to fix', async () => {
    const response = await request(app).post('/api/runs').send({ workflow: cyclicWorkflow() }).expect(422);
    const body = response.body as ApiError;

    expect(body.code).toBe('invalid_workflow');
    expect(body.issues?.map((issue) => issue.code)).toContain('CYCLE');
    expect(body.requestId).toBeTruthy();
    // A rejected run is never created.
    expect(store.size).toBe(0);
  });

  it('separates "not a workflow" (400) from "not runnable" (422)', async () => {
    const malformed = workflow([node('a', 'transform', { operation: 'destroy' as never })]);
    const response = await request(app).post('/api/runs').send({ workflow: malformed }).expect(400);

    expect((response.body as ApiError).code).toBe('malformed_request');
    // The message names the exact path, which is what makes a 400 actionable.
    expect(response.body.error).toMatch(/workflow\.nodes\[0\]\.config\.operation/);
  });

  it('rejects out-of-range simulation options', async () => {
    const response = await request(app)
      .post('/api/runs')
      .send({ workflow: linearWorkflow(), options: { failureRate: 5 } })
      .expect(400);

    expect(response.body.error).toMatch(/options\.failureRate/);
  });

  it('echoes a client-supplied request id so a timed-out call stays traceable', async () => {
    const response = await request(app).get('/api/health').set('x-client-request-id', 'cli-123');

    expect(response.headers['x-request-id']).toBe('cli-123');
  });
});

describe('GET /api/runs/:runId', () => {
  it('returns a point-in-time snapshot, which is what reload recovery reads', async () => {
    const runId = await startRun();
    const response = await request(app).get(`/api/runs/${runId}`).expect(200);

    expect(response.body.runId).toBe(runId);
    expect(response.body.lastSeq).toBeGreaterThan(0);
  });

  it('404s for an unknown run rather than inventing an empty one', async () => {
    const response = await request(app).get('/api/runs/nope').expect(404);

    expect((response.body as ApiError).code).toBe('run_not_found');
  });
});

describe('GET /api/runs/:runId/events', () => {
  it('streams a run to completion and closes on its own', async () => {
    const runId = await startRun(diamondWorkflow());
    const response = await request(app).get(`/api/runs/${runId}/events`).expect(200);

    expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    expect(response.headers['x-accel-buffering']).toBe('no');

    const events = parseEvents(response.text);
    expect(events.at(-1)?.type).toBe('run.finished');
    expect(events.at(-1)).toMatchObject({ status: 'succeeded' });
  });

  it('replays only the tail when given a cursor', async () => {
    const runId = await startRun(diamondWorkflow());
    // Drain it once so the run is finished and the log is complete.
    await request(app).get(`/api/runs/${runId}/events`).expect(200);

    const resumed = await request(app).get(`/api/runs/${runId}/events`).set('last-event-id', '4').expect(200);
    const events = parseEvents(resumed.text);

    expect(events.every((event) => event.seq > 4)).toBe(true);
    expect(events.some((event) => event.type === 'run.snapshot')).toBe(false);
  });

  it('accepts the cursor as a query parameter, for a re-attach after reload', async () => {
    const runId = await startRun();
    await request(app).get(`/api/runs/${runId}/events`).expect(200);

    const resumed = await request(app).get(`/api/runs/${runId}/events?lastEventId=2`).expect(200);

    expect(parseEvents(resumed.text).every((event) => event.seq > 2)).toBe(true);
  });

  it('leads with a snapshot when there is no usable cursor', async () => {
    const runId = await startRun();
    await request(app).get(`/api/runs/${runId}/events`).expect(200);

    const fresh = await request(app).get(`/api/runs/${runId}/events`).expect(200);

    expect(parseEvents(fresh.text)[0]?.type).toBe('run.snapshot');
  });

  it('writes a retry hint so the browser knows how fast to redial', async () => {
    const runId = await startRun();
    const response = await request(app).get(`/api/runs/${runId}/events`);

    expect(response.text.startsWith('retry: ')).toBe(true);
  });

  it('tags every frame with an id, which is what makes Last-Event-ID work', async () => {
    const runId = await startRun();
    const response = await request(app).get(`/api/runs/${runId}/events`);

    const dataFrames = response.text.split('\n\n').filter((frame) => frame.includes('data: '));
    expect(dataFrames.length).toBeGreaterThan(0);
    expect(dataFrames.every((frame) => /(^|\n)id: \d+/.test(frame))).toBe(true);
  });

  it('emits no `event:` line, so a plain onmessage handler receives everything', async () => {
    // Regression test for a bug that cost real debugging time and is invisible
    // to curl: an `event: node.updated` line makes EventSource dispatch a typed
    // event, which never reaches `onmessage`. The stream looks perfect in a
    // terminal and delivers nothing to the browser.
    const runId = await startRun();
    const response = await request(app).get(`/api/runs/${runId}/events`);

    expect(response.text).not.toMatch(/(^|\n)event:/);
    // The discriminant lives in the payload instead.
    expect(parseEvents(response.text).every((event) => typeof event.type === 'string')).toBe(true);
  });

  it('404s for an unknown run before opening a stream', async () => {
    const response = await request(app).get('/api/runs/nope/events').expect(404);

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('POST /api/runs/:runId/cancel', () => {
  it('accepts a cancel with 202 while the run is in flight', async () => {
    const runId = await startRun(diamondWorkflow(), { failureRate: 0, minDurationMs: 400, maxDurationMs: 400 });
    const response = await request(app).post(`/api/runs/${runId}/cancel`).expect(202);

    expect(response.body).toEqual({ runId, status: 'canceling' });
  });

  it('409s once the run has already finished', async () => {
    const runId = await startRun();
    await request(app).get(`/api/runs/${runId}/events`).expect(200);

    const response = await request(app).post(`/api/runs/${runId}/cancel`).expect(409);
    expect((response.body as ApiError).code).toBe('run_already_finished');
  });
});

describe('routing and error handling', () => {
  it('404s an unknown path in the standard envelope', async () => {
    const response = await request(app).get('/api/nope').expect(404);

    expect(response.body).toMatchObject({ code: 'not_found' });
    expect(response.body.requestId).toBeTruthy();
  });

  it('404s a known path used with the wrong method', async () => {
    await request(app).post('/api/health').expect(404);
  });

  it('turns unparseable JSON into a 400, not a 500', async () => {
    const response = await request(app).post('/api/runs').set('content-type', 'application/json').send('{"workflow":').expect(400);

    expect((response.body as ApiError).code).toBe('malformed_request');
  });

  it('does not deadlock on a graph with a duplicate edge', async () => {
    const graph = workflow([node('in', 'input'), node('out', 'output')], [edge('in', 'out', 'e1'), edge('in', 'out', 'e2')]);
    const runId = await startRun(graph);

    const events = parseEvents((await request(app).get(`/api/runs/${runId}/events`)).text);
    expect(events.at(-1)).toMatchObject({ type: 'run.finished', status: 'succeeded' });
  });
});
