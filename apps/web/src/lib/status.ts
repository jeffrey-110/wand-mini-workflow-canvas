import type { NodeRunStatus, RunStatus } from '@repo/types';

/**
 * One place that decides what each status *means* and looks like, so the node
 * badge, the inspector, the toolbar and the minimap can't drift apart in
 * wording or colour. `tone` is the only thing that reaches CSS.
 */

export interface StatusMeta {
  label: string;
  /** A single character, used where there is no room for the word. */
  glyph: string;
  tone: string;
}

export const NODE_STATUS_META: Record<NodeRunStatus, StatusMeta> = {
  queued: { label: 'Queued', glyph: '○', tone: 'queued' },
  running: { label: 'Running', glyph: '◐', tone: 'running' },
  succeeded: { label: 'Succeeded', glyph: '✓', tone: 'succeeded' },
  failed: { label: 'Failed', glyph: '✕', tone: 'failed' },
  // "Skipped" and "failed" have to read as different things at a glance: one
  // step broke, these were collateral. Different glyph, different colour.
  skipped: { label: 'Skipped', glyph: '⇥', tone: 'skipped' },
  canceled: { label: 'Canceled', glyph: '⊘', tone: 'canceled' },
};

export const RUN_STATUS_META: Record<RunStatus, Omit<StatusMeta, 'glyph'>> = {
  queued: { label: 'Starting', tone: 'running' },
  running: { label: 'Running', tone: 'running' },
  succeeded: { label: 'Succeeded', tone: 'succeeded' },
  failed: { label: 'Failed', tone: 'failed' },
  canceled: { label: 'Canceled', tone: 'canceled' },
};

/** Sub-second durations stay in ms; anything longer reads better in seconds. */
export function formatDuration(fromMs: number, toMs: number): string {
  const ms = Math.max(0, toMs - fromMs);
  return ms < 1_000 ? `${ms}ms` : `${(ms / 1_000).toFixed(1)}s`;
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
