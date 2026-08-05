/**
 * Run state and the streaming event contract.
 *
 * Every event carries a monotonic `seq` scoped to its run. That single field is
 * what makes reconnection cheap: the API keeps the run's event log, the browser
 * echoes the last id it saw as `Last-Event-ID`, and the API replays the tail.
 * The client can therefore treat the stream as a log it folds into state rather
 * than a set of one-shot notifications it must not miss.
 */

export const NODE_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'skipped', 'canceled'] as const;
export type NodeRunStatus = (typeof NODE_RUN_STATUSES)[number];

export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'canceled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface NodeRunState {
  nodeId: string;
  status: NodeRunStatus;
  startedAt?: number;
  finishedAt?: number;
  /** Result on success — what downstream steps receive. */
  output?: string;
  /** Human-readable failure reason. */
  error?: string;
  /** Id of the upstream node whose failure retired this one. */
  skippedBecauseOf?: string;
}

export interface RunSnapshot {
  runId: string;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  nodes: Record<string, NodeRunState>;
  /** seq of the last event emitted — a late joiner resumes from here. */
  lastSeq: number;
}

export type RunEvent =
  | { seq: number; at: number; type: 'run.snapshot'; snapshot: RunSnapshot }
  | { seq: number; at: number; type: 'run.started'; runId: string; nodeIds: string[] }
  | { seq: number; at: number; type: 'node.updated'; state: NodeRunState }
  | { seq: number; at: number; type: 'run.finished'; runId: string; status: RunStatus; finishedAt: number };

export type RunEventType = RunEvent['type'];

/**
 * A `RunEvent` before the store stamps it.
 *
 * A plain `Omit<RunEvent, 'seq' | 'at'>` would collapse the union down to the
 * keys every member shares — i.e. just `type` — and quietly reject the payload
 * of every event. Distributing the `Omit` over each member keeps them intact.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type RunEventDraft = DistributiveOmit<RunEvent, 'seq' | 'at'>;

/**
 * Simulation knobs. Exposed on the create-run request rather than hidden in
 * server config, because "watch a failure propagate" is a thing a reviewer
 * needs to do on demand, not by rerunning until the dice cooperate.
 */
export interface RunOptions {
  /** Probability that any given node fails, 0–1. */
  failureRate: number;
  minDurationMs: number;
  maxDurationMs: number;
}

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ['succeeded', 'failed', 'canceled'];
export const TERMINAL_NODE_STATUSES: readonly NodeRunStatus[] = ['succeeded', 'failed', 'skipped', 'canceled'];

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export function isTerminalNodeStatus(status: NodeRunStatus): boolean {
  return TERMINAL_NODE_STATUSES.includes(status);
}
