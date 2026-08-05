import { useEffect, useMemo, useState } from 'react';

import { Button, Pill, ProgressBar, SelectField } from '../components/index.ts';
import { useValidation } from '../hooks/useValidation.ts';
import { formatDuration, RUN_STATUS_META } from '../lib/status.ts';
import { useGraphStore, useIsRunActive, useRunStore } from '../state/index.ts';

interface Props {
  failureRate: number;
  onFailureRateChange: (rate: number) => void;
}

const FAILURE_RATES = [
  { value: '0', label: '0% — never fail' },
  { value: '0.1', label: '10% — the default' },
  { value: '0.35', label: '35% — see it break' },
  { value: '1', label: '100% — always fail' },
];

/**
 * Run controls, and the one-glance answer to "what is happening right now".
 *
 * The failure-rate control is a product decision, not a debug toggle: the run
 * is simulated, and "watch a failure propagate through the graph" is something
 * a person evaluating this needs to do on demand rather than by pressing Run
 * until the dice cooperate. It's disabled mid-run, because changing it then
 * would imply it affects the run in flight.
 */
export function RunToolbar({ failureRate, onFailureRateChange }: Props) {
  const toWorkflow = useGraphStore((state) => state.toWorkflow);
  const nodeCount = useGraphStore((state) => state.nodes.length);
  const loadExample = useGraphStore((state) => state.loadExample);
  const clearGraph = useGraphStore((state) => state.clear);

  const validation = useValidation();
  const errorCount = validation.issues.filter((issue) => issue.severity === 'error').length;

  const status = useRunStore((state) => state.status);
  const isStarting = useRunStore((state) => state.isStarting);
  const isCanceling = useRunStore((state) => state.isCanceling);
  const startRun = useRunStore((state) => state.start);
  const cancelRun = useRunStore((state) => state.cancel);
  const dismissRun = useRunStore((state) => state.dismiss);
  const isRunning = useIsRunActive();

  const canRun = nodeCount > 0 && errorCount === 0 && !isRunning && !isStarting;

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__mark" aria-hidden />
        <div>
          <h1>Mini Workflow Canvas</h1>
          <p>{nodeCount === 0 ? 'Empty workflow' : `${nodeCount} step${nodeCount === 1 ? '' : 's'}`}</p>
        </div>
      </div>

      <RunProgress />

      <div className="toolbar__actions">
        <SelectField
          id="failure-rate"
          label="Failure rate"
          value={String(failureRate)}
          options={FAILURE_RATES}
          disabled={isRunning}
          title="Simulated per-step failure probability. Turn it up to watch failures propagate."
          onChange={(value) => onFailureRateChange(Number(value))}
        />

        {nodeCount === 0 ? (
          <Button onClick={loadExample}>Load example</Button>
        ) : (
          <Button onClick={clearGraph} disabled={isRunning} title={isRunning ? "Can't edit the graph while a run is in flight" : 'Remove every step'}>
            Clear
          </Button>
        )}

        {status && !isRunning ? <Button onClick={dismissRun}>Dismiss result</Button> : null}

        {isRunning ? (
          <Button variant="danger" onClick={() => void cancelRun()} disabled={isCanceling} shortcut="⌘.">
            {isCanceling ? 'Canceling…' : 'Cancel run'}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void startRun(toWorkflow(), { failureRate })}
            disabled={!canRun}
            shortcut="⌘↵"
            title={nodeCount === 0 ? 'Add some steps first' : errorCount > 0 ? `Fix ${errorCount} error${errorCount === 1 ? '' : 's'} before running` : 'Run this workflow'}
          >
            {isStarting ? 'Starting…' : 'Run'}
          </Button>
        )}
      </div>
    </header>
  );
}

function RunProgress() {
  const status = useRunStore((state) => state.status);
  const nodeStates = useRunStore((state) => state.nodeStates);
  const startedAt = useRunStore((state) => state.startedAt);
  const finishedAt = useRunStore((state) => state.finishedAt);
  const streamState = useRunStore((state) => state.streamState);

  // The elapsed counter is the only thing on screen that has to move without a
  // server event, so it gets its own local tick rather than a global one.
  const now = useTicker(startedAt !== null && finishedAt === null);

  const tally = useMemo(() => {
    const states = Object.values(nodeStates);
    return {
      total: states.length,
      settled: states.filter((state) => state.status !== 'queued' && state.status !== 'running').length,
      running: states.filter((state) => state.status === 'running').length,
      failed: states.filter((state) => state.status === 'failed').length,
      skipped: states.filter((state) => state.status === 'skipped').length,
    };
  }, [nodeStates]);

  if (!status) {
    return (
      <div className="toolbar__status">
        <Pill tone="idle">Not run yet</Pill>
      </div>
    );
  }

  const meta = RUN_STATUS_META[status];
  const percent = tally.total === 0 ? 0 : (tally.settled / tally.total) * 100;

  return (
    <div className="toolbar__status" role="status" aria-live="polite">
      <div className="toolbar__status-row">
        <Pill tone={meta.tone}>{meta.label}</Pill>
        <span className="toolbar__counts">
          {tally.settled}/{tally.total} steps
          {tally.running > 0 ? ` · ${tally.running} running` : ''}
          {tally.failed > 0 ? ` · ${tally.failed} failed` : ''}
          {tally.skipped > 0 ? ` · ${tally.skipped} skipped` : ''}
        </span>
        {startedAt !== null ? <span className="toolbar__elapsed">{formatDuration(startedAt, finishedAt ?? now)}</span> : null}
        {streamState === 'reconnecting' ? <Pill tone="warn">Reconnecting…</Pill> : null}
      </div>

      <ProgressBar percent={percent} tone={meta.tone} label={`${tally.settled} of ${tally.total} steps complete`} />
    </div>
  );
}

/** Ticks only while something is actually elapsing, so an idle tab is idle. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  return now;
}
