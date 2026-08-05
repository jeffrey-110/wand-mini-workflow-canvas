import { randomUUID } from 'node:crypto';

import { isTerminalRunStatus, type NodeRunState, type RunEvent, type RunEventDraft, type RunOptions, type RunSnapshot, type RunStatus, type Workflow } from '@repo/types';

/**
 * The run registry: state, an append-only event log, and the live subscribers.
 *
 * **Why keep the log and not just the latest state.** Reconnection and late
 * joining both reduce to "give me everything after seq N", which is a one-line
 * filter over a log and an unbounded pile of special cases without one. It is
 * also what lets the client treat the stream as authoritative — it never has to
 * infer a status it might have missed.
 *
 * Persistence is out of scope for this exercise, so this is a `Map` with a TTL
 * sweeper. The interface is deliberately the one a Redis- or Postgres-backed
 * store would expose (`create` / `get` / `emit` / `subscribe`), so swapping the
 * implementation is a single-file change — see the durability note in the README.
 */

export interface Run {
  id: string;
  workflow: Workflow;
  options: ResolvedRunOptions;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  nodes: Map<string, NodeRunState>;
  events: RunEvent[];
  /** Last assigned sequence number. Assigned only in `emit`. */
  seq: number;
  abort: AbortController;
  subscribers: Set<Subscriber>;
}

export interface ResolvedRunOptions extends RunOptions {
  /**
   * Force specific nodes to fail. Not reachable from the HTTP API — it exists
   * so the scheduler's failure and skip semantics can be tested without
   * fighting a coin flip.
   */
  failNodeIds?: string[];
}

export type Subscriber = (event: RunEvent) => void;

export interface RunStoreOptions {
  ttlMs: number;
  maxRuns: number;
}

export interface Subscription {
  /** What this subscriber needs before it is caught up. */
  backlog: RunEvent[];
  unsubscribe: () => void;
}

export class RunStore {
  readonly #runs = new Map<string, Run>();
  readonly #options: RunStoreOptions;
  #sweeper: NodeJS.Timeout | undefined;

  constructor(options: RunStoreOptions) {
    this.#options = options;
  }

  get size(): number {
    return this.#runs.size;
  }

  get activeCount(): number {
    let active = 0;
    for (const run of this.#runs.values()) {
      if (!isTerminalRunStatus(run.status)) active += 1;
    }
    return active;
  }

  create(workflow: Workflow, options: ResolvedRunOptions): Run {
    const run: Run = {
      id: randomUUID(),
      workflow,
      options,
      status: 'queued',
      startedAt: Date.now(),
      nodes: new Map(workflow.nodes.map((node) => [node.id, { nodeId: node.id, status: 'queued' }])),
      events: [],
      seq: 0,
      abort: new AbortController(),
      subscribers: new Set(),
    };

    this.#runs.set(run.id, run);
    this.#evict();
    this.#ensureSweeper();
    return run;
  }

  get(runId: string): Run | undefined {
    return this.#runs.get(runId);
  }

  /**
   * Append to the log and fan out. `seq` is assigned here and nowhere else,
   * which is what guarantees it stays monotonic and gap-free per run.
   */
  emit(run: Run, event: RunEventDraft): RunEvent {
    run.seq += 1;
    const full = { ...event, seq: run.seq, at: Date.now() } as RunEvent;
    run.events.push(full);

    for (const subscriber of run.subscribers) {
      try {
        subscriber(full);
      } catch {
        // A broken pipe on one subscriber must not stall the run or starve the
        // others. Drop it; its client will reconnect and replay from its cursor.
        run.subscribers.delete(subscriber);
      }
    }
    return full;
  }

  updateNode(run: Run, nodeId: string, patch: Partial<NodeRunState>): NodeRunState {
    const next: NodeRunState = { ...(run.nodes.get(nodeId) ?? { nodeId, status: 'queued' }), ...patch };
    run.nodes.set(nodeId, next);
    this.emit(run, { type: 'node.updated', state: next });
    return next;
  }

  setStatus(run: Run, status: RunStatus): void {
    run.status = status;
    if (!isTerminalRunStatus(status)) return;

    run.finishedAt = Date.now();
    this.emit(run, { type: 'run.finished', runId: run.id, status, finishedAt: run.finishedAt });
  }

  snapshot(run: Run): RunSnapshot {
    return {
      runId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
      nodes: Object.fromEntries(run.nodes),
      lastSeq: run.seq,
    };
  }

  /**
   * Attach a subscriber and hand back the backlog it needs first.
   *
   * `afterSeq` is the client's cursor. When it's usable we replay only the tail;
   * otherwise we lead with a full snapshot, so a tab that was closed for a
   * minute converges in one message rather than replaying hundreds of events.
   *
   * Registering the subscriber and reading the backlog happen in the same
   * synchronous block — that's what stops an event slipping between the two and
   * leaving a permanent gap in the client's view.
   */
  subscribe(run: Run, subscriber: Subscriber, afterSeq: number | null): Subscription {
    const canReplay = afterSeq !== null && afterSeq <= run.seq;
    const backlog: RunEvent[] = canReplay
      ? run.events.filter((event) => event.seq > afterSeq)
      : [{ seq: run.seq, at: Date.now(), type: 'run.snapshot', snapshot: this.snapshot(run) }];

    run.subscribers.add(subscriber);
    return { backlog, unsubscribe: () => run.subscribers.delete(subscriber) };
  }

  /** Returns false when the run had already finished — a race, not an error. */
  cancel(run: Run): boolean {
    if (isTerminalRunStatus(run.status)) return false;
    run.abort.abort(new RunCanceledError());
    return true;
  }

  /** Shutdown/test hook: stop the sweeper and abort anything in flight. */
  dispose(): void {
    if (this.#sweeper) clearInterval(this.#sweeper);
    this.#sweeper = undefined;

    for (const run of this.#runs.values()) {
      if (!isTerminalRunStatus(run.status)) run.abort.abort(new RunCanceledError());
    }
    this.#runs.clear();
  }

  #ensureSweeper(): void {
    if (this.#sweeper) return;

    this.#sweeper = setInterval(() => {
      const cutoff = Date.now() - this.#options.ttlMs;
      for (const [id, run] of this.#runs) {
        // Never sweep something still being watched, however old it is.
        if (run.finishedAt !== undefined && run.finishedAt < cutoff && run.subscribers.size === 0) this.#runs.delete(id);
      }
    }, 60_000);
    this.#sweeper.unref();
  }

  #evict(): void {
    while (this.#runs.size > this.#options.maxRuns) {
      // Map preserves insertion order, so the first finished run is the oldest.
      // In-flight runs are never evicted — dropping one would orphan its client.
      const victim = [...this.#runs.values()].find((run) => run.finishedAt !== undefined);
      if (!victim) return;
      this.#runs.delete(victim.id);
    }
  }
}

export class RunCanceledError extends Error {
  constructor() {
    super('Run canceled');
    this.name = 'RunCanceledError';
  }
}
