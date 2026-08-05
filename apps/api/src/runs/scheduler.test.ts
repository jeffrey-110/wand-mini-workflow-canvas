import { setTimeout as delay } from 'node:timers/promises';

import { diamondWorkflow, edge, linearWorkflow, node, twoChainWorkflow, workflow } from '@repo/factories';
import type { NodeRunStatus, Workflow } from '@repo/types';
import { afterEach, describe, expect, it } from 'vitest';

import { executeRun } from './scheduler.ts';
import { RunStore, type ResolvedRunOptions } from './store.ts';

/**
 * These pin down the three things about the execution model I would otherwise
 * only be able to confirm by staring at the canvas and hoping the 10% dice
 * landed the right way: concurrency, per-branch failure isolation, and
 * cancellation.
 *
 * `failNodeIds` makes failure deterministic; without it these would be flaky by
 * construction, which is the one kind of test worse than no test.
 */

const FAST: ResolvedRunOptions = { failureRate: 0, minDurationMs: 20, maxDurationMs: 30 };

const stores: RunStore[] = [];

function newStore(): RunStore {
  const store = new RunStore({ ttlMs: 60_000, maxRuns: 100 });
  stores.push(store);
  return store;
}

afterEach(() => {
  // The sweeper is unref'd, but disposing keeps runs from leaking across tests.
  stores.splice(0).forEach((store) => store.dispose());
});

async function run(graph: Workflow, options: Partial<ResolvedRunOptions> = {}) {
  const store = newStore();
  const created = store.create(graph, { ...FAST, ...options });
  await executeRun(store, created);
  return { store, run: created, statuses: statusesOf(store, created.id) };
}

function statusesOf(store: RunStore, runId: string): Record<string, NodeRunStatus> {
  const found = store.get(runId)!;
  return Object.fromEntries([...found.nodes].map(([id, state]) => [id, state.status]));
}

describe('scheduling', () => {
  it('runs independent branches concurrently rather than one after another', async () => {
    const started = Date.now();
    const { run: finished } = await run(diamondWorkflow(), { minDurationMs: 200, maxDurationMs: 200 });
    const elapsed = Date.now() - started;

    expect(finished.status).toBe('succeeded');
    // Three sequential levels x 200ms. Serialising `a` and `b` would make it 800ms+.
    expect(elapsed).toBeGreaterThanOrEqual(560);
    expect(elapsed).toBeLessThan(760);
  });

  it('starts a node the moment its last dependency lands, not at a level barrier', async () => {
    // in → slow → out, and in → fast → out. `out` must wait for `slow`, but
    // `fast` must not wait for anything.
    const graph = workflow(
      [node('in', 'input'), node('fast', 'transform'), node('slow', 'transform'), node('out', 'output')],
      [edge('in', 'fast'), edge('in', 'slow'), edge('fast', 'out'), edge('slow', 'out')],
    );
    const { run: finished } = await run(graph, { minDurationMs: 60, maxDurationMs: 60 });

    const fast = finished.nodes.get('fast')!;
    const slow = finished.nodes.get('slow')!;
    // Both middle nodes overlap in time — neither one's start is after the
    // other's finish.
    expect(fast.startedAt!).toBeLessThan(slow.finishedAt!);
    expect(slow.startedAt!).toBeLessThan(fast.finishedAt!);
  });

  it('passes each step output to the next, so the wiring is observable', async () => {
    const graph = workflow(
      [node('in', 'input', { value: 'Wand Studio' }), node('t', 'transform', { operation: 'slugify' }), node('out', 'output')],
      [edge('in', 't'), edge('t', 'out')],
    );
    const { run: finished } = await run(graph);

    expect(finished.nodes.get('t')?.output).toBe('wand-studio');
    expect(finished.nodes.get('out')?.output).toBe('wand-studio');
  });

  it('does not deadlock on a duplicate edge between the same pair', async () => {
    // Validation permits this as a warning, so the scheduler has to survive it:
    // counting the edge twice would leave `out` waiting for a second completion
    // that never comes.
    const graph = workflow([node('in', 'input'), node('out', 'output')], [edge('in', 'out', 'e1'), edge('in', 'out', 'e2')]);
    const { run: finished } = await run(graph);

    expect(finished.status).toBe('succeeded');
  });
});

describe('failure handling', () => {
  it('skips only the descendants of a failed node; siblings finish', async () => {
    const { statuses, run: finished } = await run(diamondWorkflow(), { failNodeIds: ['a'] });

    expect(statuses).toEqual({
      in: 'succeeded',
      a: 'failed',
      b: 'succeeded', // the sibling branch was not cut short
      out: 'skipped', // downstream of the failure, so it can never get its input
    });
    expect(finished.status).toBe('failed');
  });

  it('records which upstream step caused a skip', async () => {
    const { run: finished } = await run(diamondWorkflow(), { failNodeIds: ['a'] });

    expect(finished.nodes.get('out')?.skippedBecauseOf).toBe('a');
    expect(finished.nodes.get('a')?.error).toMatch(/failed while executing/);
  });

  it('lets an unrelated branch run to completion after another branch fails', async () => {
    const { statuses, run: finished } = await run(twoChainWorkflow(), { failNodeIds: ['bad'] });

    expect(statuses.out1).toBe('skipped');
    expect(statuses.out2).toBe('succeeded');
    expect(finished.status).toBe('failed');
  });

  it('reports the run as failed even when only one of many steps failed', async () => {
    const { run: finished } = await run(twoChainWorkflow(), { failNodeIds: ['bad'] });

    expect(finished.status).toBe('failed');
  });
});

describe('cancellation', () => {
  it('stops in-flight nodes and retires everything still queued', async () => {
    const store = newStore();
    const created = store.create(diamondWorkflow(), { ...FAST, minDurationMs: 400, maxDurationMs: 400 });
    const finished = executeRun(store, created);

    await delay(60); // `in` is running, everything else is queued
    expect(store.cancel(created)).toBe(true);
    await finished;

    expect(created.status).toBe('canceled');
    for (const [id, state] of created.nodes) {
      expect(state.status, `${id}`).toBe('canceled');
    }
  });

  it('lands within a tick rather than at the next node boundary', async () => {
    const store = newStore();
    const created = store.create(linearWorkflow(), { ...FAST, minDurationMs: 5_000, maxDurationMs: 5_000 });
    const finished = executeRun(store, created);

    await delay(30);
    const startedAt = Date.now();
    store.cancel(created);
    await finished;

    // If cancel only took effect between nodes this would be ~5s.
    expect(Date.now() - startedAt).toBeLessThan(200);
  });

  it('treats a second cancel as a no-op rather than an error', async () => {
    const store = newStore();
    const created = store.create(diamondWorkflow(), { ...FAST, minDurationMs: 200, maxDurationMs: 200 });
    const finished = executeRun(store, created);

    await delay(40);
    expect(store.cancel(created)).toBe(true);
    await finished;
    expect(store.cancel(created)).toBe(false);
  });

  it('reports canceled — not failed — even though nodes were interrupted', async () => {
    const store = newStore();
    const created = store.create(diamondWorkflow(), { ...FAST, minDurationMs: 300, maxDurationMs: 300 });
    const finished = executeRun(store, created);

    await delay(50);
    store.cancel(created);
    await finished;

    expect(created.status).toBe('canceled');
  });
});
