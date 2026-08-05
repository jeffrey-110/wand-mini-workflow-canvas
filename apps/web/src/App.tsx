import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

import { isTerminalRunStatus } from '@repo/types';

import { IssueList, RunToolbar, StepInspector, StepPalette, WorkflowCanvas } from './containers/index.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useRunStore, useToastStore } from './state/index.ts';

/**
 * Page shell: three columns under a toolbar, plus the two lifecycle concerns
 * that don't belong to any single component.
 *
 * `failureRate` is the one piece of genuinely local UI state in the app — it's
 * a per-run request parameter, not something the server or the graph owns, so
 * putting it in a store would be storing it twice.
 */
export function App() {
  const [failureRate, setFailureRate] = useState(0.1);
  useKeyboardShortcuts(failureRate);

  return (
    <ReactFlowProvider>
      <div className="app">
        <RunToolbar failureRate={failureRate} onFailureRateChange={setFailureRate} />

        <div className="app__body">
          <StepPalette />
          <main className="app__canvas">
            <WorkflowCanvas />
            <IssueList />
          </main>
          <StepInspector />
        </div>

        <RunLifecycle />
      </div>
    </ReactFlowProvider>
  );
}

/**
 * Two lifecycle concerns, kept out of the render tree:
 *
 *  1. **Re-attach to a run left behind by a reload.** The run lives on the
 *     server; closing or refreshing the tab shouldn't orphan it. `restore()`
 *     reads the cursor from sessionStorage, fetches the snapshot, and only
 *     reconnects if the run is genuinely still going.
 *
 *  2. **Announce the outcome once.** The canvas carries the detail; this is the
 *     "it's over, here's the headline" — fired on the transition into a
 *     terminal status, not on every render that happens to see one.
 */
function RunLifecycle() {
  const restore = useRunStore((state) => state.restore);
  const pushToast = useToastStore((state) => state.push);
  const previousStatus = useRef<string | null>(null);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(
    () =>
      useRunStore.subscribe((state) => {
        const status = state.status;
        if (status === previousStatus.current) return;

        // Only announce a transition *into* a terminal state from an active
        // one. Without this, restoring a finished run on page load would
        // announce a result the user already saw.
        const wasActive = previousStatus.current !== null && !isTerminalRunStatus(previousStatus.current as never);
        previousStatus.current = status;
        if (!status || !isTerminalRunStatus(status) || !wasActive) return;

        if (status === 'succeeded') {
          pushToast({ tone: 'info', message: 'Run finished — every step succeeded.' });
          return;
        }
        if (status === 'canceled') {
          pushToast({ tone: 'warn', message: 'Run canceled.' });
          return;
        }

        const failed = Object.values(state.nodeStates).filter((node) => node.status === 'failed').length;
        pushToast({ tone: 'error', message: `Run failed — ${failed} step${failed === 1 ? '' : 's'} errored.` });
      }),
    [pushToast],
  );

  return null;
}
