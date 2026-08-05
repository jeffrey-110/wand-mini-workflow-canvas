import { setTimeout as delay } from 'node:timers/promises';

import type { NodeRunStatus, WorkflowNode } from '@repo/types';
import { applyNode, buildAdjacency, descendantsOf, nodeLabel } from '@repo/workflow';

import { RunCanceledError, type Run, type RunStore } from './store.ts';

/**
 * The execution model.
 *
 * **Scheduling.** A workflow is a DAG, so eligibility is simply: a node may run
 * once every one of its upstream nodes has *succeeded*. Everything eligible at
 * a given instant starts immediately. There is no level-by-level barrier, so a
 * fast branch never waits on a slow sibling — concurrency is whatever the
 * graph's own shape allows, which is exactly what the brief asks for.
 *
 * **Failure is per-branch, not fail-fast.** When a node fails, its transitive
 * descendants are retired as `skipped` — they can never receive an input — but
 * every unrelated in-flight node runs to completion. In a builder that is
 * almost always what you want: you learn everything that was broken in one run
 * instead of fixing one node per attempt. The run's terminal status is `failed`
 * if anything failed, `canceled` if the user pulled the plug, else `succeeded`.
 *
 * **Cancellation** is one `AbortController` per run. A node's simulated work is
 * an abortable sleep, so a cancel lands within a tick rather than at the next
 * node boundary, and nodes that never started are retired in the same pass.
 *
 * The scheduler owns no state of its own: everything observable goes through
 * `store.updateNode` / `store.setStatus`, so every transition is an event on
 * the log and there is no way to change what the UI sees without recording it.
 */
export async function executeRun(store: RunStore, run: Run): Promise<void> {
  const { dependencies, dependents } = buildAdjacency(
    run.workflow.nodes.map((node) => node.id),
    run.workflow.edges,
  );
  const nodesById = new Map(run.workflow.nodes.map((node) => [node.id, node]));

  /** Outstanding upstream dependencies per node; a node is eligible at zero. */
  const pending = new Map<string, number>(run.workflow.nodes.map((node) => [node.id, dependencies.get(node.id)?.size ?? 0]));
  const outputs = new Map<string, string>();
  const inFlight = new Set<Promise<void>>();
  let anyFailed = false;

  store.setStatus(run, 'running');
  store.emit(run, { type: 'run.started', runId: run.id, nodeIds: run.workflow.nodes.map((node) => node.id) });

  /** Settle a node and propagate the consequence to everything downstream. */
  function settle(nodeId: string, status: NodeRunStatus): void {
    pending.delete(nodeId);

    if (status === 'succeeded') {
      for (const dependent of dependents.get(nodeId) ?? []) {
        const outstanding = pending.get(dependent);
        if (outstanding !== undefined) pending.set(dependent, outstanding - 1);
      }
      return;
    }

    if (status === 'failed') anyFailed = true;

    // Nothing downstream of a node that didn't succeed can ever receive its
    // input, so retire the whole subtree now rather than leaving it `queued`
    // forever. `skipped` reads very differently from `failed` on the canvas,
    // and that distinction is the point: one step broke, these were collateral.
    for (const descendant of descendantsOf(nodeId, dependents)) {
      if (!pending.has(descendant)) continue;
      pending.delete(descendant);

      store.updateNode(run, descendant, {
        status: status === 'canceled' ? 'canceled' : 'skipped',
        finishedAt: Date.now(),
        ...(status === 'canceled' ? {} : { skippedBecauseOf: nodeId }),
      });
    }
  }

  async function runNode(node: WorkflowNode): Promise<void> {
    store.updateNode(run, node.id, { status: 'running', startedAt: Date.now() });

    const inbound = [...(dependencies.get(node.id) ?? [])].map((upstream) => outputs.get(upstream)).filter((value): value is string => value !== undefined);

    try {
      await delay(randomDuration(run.options.minDurationMs, run.options.maxDurationMs), undefined, { signal: run.abort.signal });

      if (shouldFail(run, node.id)) {
        throw new NodeExecutionError(`${nodeLabel(node)} failed while executing (simulated).`);
      }

      const output = applyNode(node, inbound);
      outputs.set(node.id, output);
      store.updateNode(run, node.id, { status: 'succeeded', finishedAt: Date.now(), output });
      settle(node.id, 'succeeded');
    } catch (error) {
      if (isAbort(error)) {
        store.updateNode(run, node.id, { status: 'canceled', finishedAt: Date.now() });
        settle(node.id, 'canceled');
        return;
      }
      store.updateNode(run, node.id, {
        status: 'failed',
        finishedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      settle(node.id, 'failed');
    }
  }

  function launchEligible(): void {
    if (run.abort.signal.aborted) return;

    // Snapshot the keys: `runNode` mutates `pending` synchronously before its
    // first await, so iterating the live map here would skip entries.
    for (const [nodeId, outstanding] of [...pending]) {
      if (outstanding !== 0) continue;

      pending.delete(nodeId);
      const node = nodesById.get(nodeId);
      if (!node) continue;

      // `task` refers to itself so it can remove itself from the in-flight set.
      // The assertion is honest: the closure only reads `task` after its first
      // await, by which point the assignment has completed.
      let task!: Promise<void>;
      task = (async () => {
        try {
          await runNode(node);
        } finally {
          inFlight.delete(task);
        }
      })();
      inFlight.add(task);
    }
  }

  launchEligible();
  while (inFlight.size > 0) {
    // Wake on the *first* completion, not all of them: that's what makes a node
    // start the instant its last dependency lands rather than at a barrier.
    await Promise.race(inFlight);
    launchEligible();
  }

  if (run.abort.signal.aborted) {
    // Anything still queued when the loop drained was cut off by the cancel.
    for (const nodeId of [...pending.keys()]) {
      pending.delete(nodeId);
      store.updateNode(run, nodeId, { status: 'canceled', finishedAt: Date.now() });
    }
    store.setStatus(run, 'canceled');
    return;
  }

  store.setStatus(run, anyFailed ? 'failed' : 'succeeded');
}

/**
 * `failNodeIds` short-circuits the dice entirely (tests), otherwise it's the
 * configured probability.
 */
function shouldFail(run: Run, nodeId: string): boolean {
  const forced = run.options.failNodeIds;
  if (forced) return forced.includes(nodeId);
  return Math.random() < run.options.failureRate;
}

function randomDuration(minMs: number, maxMs: number): number {
  return Math.round(minMs + Math.random() * Math.max(0, maxMs - minMs));
}

/**
 * `timers/promises` rejects with an `AbortError` carrying the abort reason as
 * `cause`, so the cancel has to be recognised through either shape.
 */
function isAbort(error: unknown): boolean {
  if (error instanceof RunCanceledError) return true;
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.cause instanceof RunCanceledError;
}

export class NodeExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeExecutionError';
  }
}
