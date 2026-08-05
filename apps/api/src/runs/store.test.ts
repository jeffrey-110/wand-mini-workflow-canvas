import { diamondWorkflow, linearWorkflow } from '@repo/factories';
import type { RunEvent } from '@repo/types';
import { afterEach, describe, expect, it } from 'vitest';

import { executeRun } from './scheduler.ts';
import { RunStore, type ResolvedRunOptions } from './store.ts';

/**
 * The store's job is the event log, and the log's job is reconnection. These
 * cover the invariants the streaming route depends on — monotonic sequence
 * numbers, no gaps, and a backlog that is correct whether the client is fresh,
 * resuming, or arriving after the run is over.
 */

const FAST: ResolvedRunOptions = { failureRate: 0, minDurationMs: 5, maxDurationMs: 10 };

const stores: RunStore[] = [];

function newStore(maxRuns = 100): RunStore {
  const store = new RunStore({ ttlMs: 60_000, maxRuns });
  stores.push(store);
  return store;
}

afterEach(() => stores.splice(0).forEach((store) => store.dispose()));

describe('the event log', () => {
  it('assigns strictly increasing, gap-free sequence numbers', async () => {
    const store = newStore();
    const run = store.create(diamondWorkflow(), FAST);
    await executeRun(store, run);

    const seqs = run.events.map((event) => event.seq);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, index) => index + 1));
  });

  it('ends with run.finished, so a replay always terminates', async () => {
    const store = newStore();
    const run = store.create(linearWorkflow(), FAST);
    await executeRun(store, run);

    expect(run.events.at(-1)?.type).toBe('run.finished');
    expect(store.snapshot(run).lastSeq).toBe(run.seq);
  });

  it('drops a subscriber that throws instead of stalling the run', async () => {
    const store = newStore();
    const run = store.create(linearWorkflow(), FAST);
    const healthy: RunEvent[] = [];

    store.subscribe(
      run,
      () => {
        throw new Error('broken pipe');
      },
      0,
    );
    store.subscribe(run, (event) => healthy.push(event), 0);

    await executeRun(store, run);

    expect(run.subscribers.size).toBe(1);
    expect(healthy.at(-1)?.type).toBe('run.finished');
  });
});

describe('subscribing', () => {
  it('leads with a snapshot when the client has no cursor', async () => {
    const store = newStore();
    const run = store.create(diamondWorkflow(), FAST);
    await executeRun(store, run);

    const { backlog } = store.subscribe(run, () => {}, null);

    expect(backlog).toHaveLength(1);
    expect(backlog[0]?.type).toBe('run.snapshot');
  });

  it('replays only the tail when the client has one', async () => {
    const store = newStore();
    const run = store.create(diamondWorkflow(), FAST);
    await executeRun(store, run);

    const { backlog } = store.subscribe(run, () => {}, 3);

    expect(backlog.every((event) => event.seq > 3)).toBe(true);
    expect(backlog.at(-1)?.type).toBe('run.finished');
  });

  it('falls back to a snapshot when the cursor is ahead of the log', async () => {
    // A cursor from a *different*, longer run — or a client that lied. Replaying
    // nothing would leave it permanently blank, so a snapshot is the safe answer.
    const store = newStore();
    const run = store.create(linearWorkflow(), FAST);
    await executeRun(store, run);

    const { backlog } = store.subscribe(run, () => {}, run.seq + 50);

    expect(backlog[0]?.type).toBe('run.snapshot');
  });

  it('delivers events emitted after attaching, with no gap at the seam', async () => {
    const store = newStore();
    const run = store.create(linearWorkflow(), FAST);
    const received: number[] = [];

    const { backlog, unsubscribe } = store.subscribe(run, (event) => received.push(event.seq), 0);
    await executeRun(store, run);
    unsubscribe();

    const seen = [...backlog.map((event) => event.seq), ...received];
    expect(seen).toEqual(Array.from({ length: run.seq }, (_, index) => index + 1));
  });

  it('stops delivering after unsubscribe', async () => {
    const store = newStore();
    const run = store.create(linearWorkflow(), FAST);

    const { unsubscribe } = store.subscribe(run, () => {}, 0);
    expect(run.subscribers.size).toBe(1);
    unsubscribe();
    expect(run.subscribers.size).toBe(0);
  });
});

describe('retention', () => {
  it('evicts the oldest finished run once the cap is exceeded', async () => {
    const store = newStore(2);

    const first = store.create(linearWorkflow(), FAST);
    await executeRun(store, first);
    const second = store.create(linearWorkflow(), FAST);
    await executeRun(store, second);
    const third = store.create(linearWorkflow(), FAST);
    await executeRun(store, third);

    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(third.id)).toBeDefined();
  });

  it('never evicts a run that is still in flight', () => {
    const store = newStore(1);

    const inFlight = store.create(linearWorkflow(), FAST);
    store.create(linearWorkflow(), FAST);
    store.create(linearWorkflow(), FAST);

    // Dropping one of these would orphan a client that is watching it.
    expect(store.get(inFlight.id)).toBeDefined();
    expect(store.activeCount).toBe(3);
  });
});
