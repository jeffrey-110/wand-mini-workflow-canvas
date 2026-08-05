import type { WorkflowEdge } from '@repo/types';

/**
 * Graph algorithms, kept free of any notion of node *kind*.
 *
 * The validator, the connection guard and the execution scheduler all need the
 * same three questions answered — who depends on whom, is there a cycle, is B
 * reachable from A — so they're answered once here against plain ids and edges.
 */

export interface Adjacency {
  /** node id → the nodes that must succeed before it can run. */
  dependencies: Map<string, Set<string>>;
  /** node id → the nodes waiting on it. */
  dependents: Map<string, Set<string>>;
}

export function buildAdjacency(nodeIds: readonly string[], edges: readonly WorkflowEdge[]): Adjacency {
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    dependencies.set(id, new Set());
    dependents.set(id, new Set());
  }
  for (const edge of edges) {
    // Sets absorb duplicate edges, which validation allows as a warning. Without
    // this a duplicate would double a node's dependency count and deadlock it.
    dependencies.get(edge.target)?.add(edge.source);
    dependents.get(edge.source)?.add(edge.target);
  }

  return { dependencies, dependents };
}

/**
 * Depth-first search returning the ids on a cycle, or null if acyclic.
 *
 * Returns the cycle itself rather than a boolean because "Cycle detected: A → B
 * → A" is a message a user can act on, and `nodeIds` drives the highlight.
 */
export function findCycle(nodeIds: readonly string[], edges: readonly WorkflowEdge[]): string[] | null {
  const { dependents } = buildAdjacency(nodeIds, edges);

  const UNVISITED = 0;
  const ON_STACK = 1;
  const DONE = 2;

  const state = new Map<string, number>(nodeIds.map((id) => [id, UNVISITED]));
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    state.set(id, ON_STACK);
    stack.push(id);

    for (const next of dependents.get(id) ?? []) {
      const seen = state.get(next) ?? UNVISITED;
      // A back-edge to something still on the stack closes a loop; trim the
      // stack down to just that loop so the message names the right nodes.
      if (seen === ON_STACK) return [...stack.slice(stack.indexOf(next)), next];
      if (seen === UNVISITED) {
        const found = visit(next);
        if (found) return found;
      }
    }

    stack.pop();
    state.set(id, DONE);
    return null;
  }

  for (const id of nodeIds) {
    if ((state.get(id) ?? UNVISITED) === UNVISITED) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/** Is `to` reachable from `from` by following edges forward? */
export function isReachable(edges: readonly WorkflowEdge[], from: string, to: string): boolean {
  if (from === to) return true;

  const forward = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = forward.get(edge.source);
    if (existing) existing.push(edge.target);
    else forward.set(edge.source, [edge.target]);
  }

  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of forward.get(current) ?? []) {
      if (next === to) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

/** Every node downstream of `nodeId`, transitively. */
export function descendantsOf(nodeId: string, dependents: Adjacency['dependents']): string[] {
  const seen = new Set<string>();
  const queue = [...(dependents.get(nodeId) ?? [])];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(dependents.get(current) ?? []));
  }
  return [...seen];
}
