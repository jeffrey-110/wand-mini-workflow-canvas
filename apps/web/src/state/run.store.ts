import { create } from 'zustand';

import { isTerminalRunStatus, type NodeRunState, type RunEvent, type RunOptions, type RunSnapshot, type RunStatus, type Workflow } from '@repo/types';

import { isApiRequestError } from '../services/api.ts';
import { cancelRun, createRun, getRun, openRunStream, type RunStream, type StreamConnectionState } from '../services/runs/index.ts';

/**
 * Live run state, fed entirely by the event stream.
 *
 * **The rule: the stream is the source of truth and the client folds it like a
 * log.** Nothing about node status is inferred locally — not even optimistically
 * on cancel. The moment the UI starts guessing, a reconnect makes it disagree
 * with the server and the user has no way to tell which one is lying. So
 * "Cancel" sets `isCanceling` (a local, obviously-local flag) and waits for the
 * server to say which nodes actually stopped.
 *
 * **`lastSeq` is the resume cursor.** The browser's own `EventSource` sends it
 * back as `Last-Event-ID` on an automatic reconnect. We also mirror it into
 * `sessionStorage`, which is what makes a full page reload re-attach to a run
 * in flight rather than orphaning it — see `restore()`.
 *
 * The `EventSource` instance itself lives in a module-level variable rather
 * than in the store: it isn't state anything renders from, and putting a
 * non-serialisable handle in a store invites someone to persist it.
 */

const SESSION_KEY = 'wand.activeRun.v1';

interface RunState {
  runId: string | null;
  status: RunStatus | null;
  startedAt: number | null;
  finishedAt: number | null;
  nodeStates: Record<string, NodeRunState>;
  lastSeq: number;

  streamState: StreamConnectionState | 'idle';
  /** Set when a request failed. Cleared on the next attempt. */
  error: string | null;
  isStarting: boolean;
  isCanceling: boolean;

  start: (workflow: Workflow, options?: Partial<RunOptions>) => Promise<void>;
  cancel: () => Promise<void>;
  dismiss: () => void;
  /** Re-attach to a run left behind by a reload, if there is one. */
  restore: () => Promise<void>;
}

let stream: RunStream | null = null;

export const useRunStore = create<RunState>()((set, get) => {
  function closeStream(): void {
    stream?.close();
    stream = null;
  }

  function applySnapshot(snapshot: RunSnapshot): void {
    set({
      runId: snapshot.runId,
      status: snapshot.status,
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt ?? null,
      nodeStates: snapshot.nodes,
      lastSeq: snapshot.lastSeq,
    });
  }

  function applyEvent(event: RunEvent): void {
    switch (event.type) {
      case 'run.snapshot':
        applySnapshot(event.snapshot);
        break;
      case 'run.started':
        set({ status: 'running', lastSeq: event.seq });
        break;
      case 'node.updated':
        set((state) => ({
          // A fresh object, but only for the node that changed. Every other
          // entry keeps its identity, so its subscriber doesn't re-render.
          nodeStates: { ...state.nodeStates, [event.state.nodeId]: event.state },
          lastSeq: event.seq,
        }));
        break;
      case 'run.finished':
        set({ status: event.status, finishedAt: event.finishedAt, lastSeq: event.seq });
        break;
    }

    const { runId, lastSeq, status } = get();
    if (status && isTerminalRunStatus(status)) {
      // Close from our side too, or EventSource keeps redialling a run that has
      // nothing left to say.
      closeStream();
      clearCursor();
      set({ streamState: 'closed' });
    } else {
      saveCursor(runId, lastSeq);
    }
  }

  function attach(runId: string, fromSeq: number | null): void {
    closeStream();
    stream = openRunStream(runId, fromSeq, {
      onEvent: applyEvent,
      onStateChange: (streamState) => set({ streamState }),
    });
  }

  return {
    runId: null,
    status: null,
    startedAt: null,
    finishedAt: null,
    nodeStates: {},
    lastSeq: 0,
    streamState: 'idle',
    error: null,
    isStarting: false,
    isCanceling: false,

    start: async (workflow, options) => {
      closeStream();
      set({ isStarting: true, error: null, nodeStates: {}, lastSeq: 0, status: null, finishedAt: null, runId: null });

      try {
        const { runId, snapshot } = await createRun(workflow, options);
        applySnapshot(snapshot);
        saveCursor(runId, snapshot.lastSeq);
        // No cursor on the first attach: the POST already returned the
        // snapshot, so replaying from 0 would just repeat it.
        attach(runId, null);
      } catch (error) {
        set({ error: messageFor(error), status: null, streamState: 'idle' });
      } finally {
        set({ isStarting: false });
      }
    },

    cancel: async () => {
      const runId = get().runId;
      if (!runId) return;

      set({ isCanceling: true, error: null });
      try {
        await cancelRun(runId);
        // Deliberately no optimistic status change — see the note at the top.
      } catch (error) {
        // A 409 means the run finished first. That's a race the user can lose
        // legitimately; surfacing it as an error would be a lie.
        if (!(isApiRequestError(error) && error.code === 'run_already_finished')) {
          set({ error: messageFor(error) });
        }
      } finally {
        set({ isCanceling: false });
      }
    },

    dismiss: () => {
      closeStream();
      clearCursor();
      set({ runId: null, status: null, startedAt: null, finishedAt: null, nodeStates: {}, lastSeq: 0, streamState: 'idle', error: null });
    },

    restore: async () => {
      const cursor = readCursor();
      if (!cursor) return;

      try {
        // Fetch the snapshot first rather than opening the stream blind: it
        // tells us whether the run is even still going, and it paints the
        // canvas one round trip sooner.
        const snapshot = await getRun(cursor.runId);
        applySnapshot(snapshot);

        if (isTerminalRunStatus(snapshot.status)) {
          // It finished while we were away. Show the result; don't reconnect.
          clearCursor();
          set({ streamState: 'closed' });
          return;
        }
        attach(cursor.runId, cursor.lastSeq);
      } catch {
        // Expired or unknown run: drop the cursor rather than showing a ghost.
        clearCursor();
      }
    },
  };
});

/**
 * Per-node subscription. This is the reason a run doesn't re-render the canvas:
 * a node component reads only its own slice, so an event for another node is
 * referentially identical here and React bails out.
 */
export function useNodeRunState(nodeId: string): NodeRunState | undefined {
  return useRunStore((state) => state.nodeStates[nodeId]);
}

export function useIsRunActive(): boolean {
  return useRunStore((state) => state.status !== null && !isTerminalRunStatus(state.status));
}

// --- Reload recovery cursor -------------------------------------------------
// sessionStorage rather than localStorage: a run belongs to this tab's session.
// Restoring one in a brand-new window a day later would be a ghost, not a
// feature. Every access is guarded — private mode and quota both throw.

function saveCursor(runId: string | null, lastSeq: number): void {
  if (!runId) return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ runId, lastSeq }));
  } catch {
    // Resume is a nicety, not a requirement.
  }
}

function readCursor(): { runId: string; lastSeq: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { runId?: unknown; lastSeq?: unknown };
    if (typeof parsed.runId !== 'string' || typeof parsed.lastSeq !== 'number') return null;
    return { runId: parsed.runId, lastSeq: parsed.lastSeq };
  } catch {
    return null;
  }
}

function clearCursor(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore.
  }
}

function messageFor(error: unknown): string {
  if (isApiRequestError(error)) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}
