import { diamondWorkflow, edge } from '@repo/factories';
import { describe, expect, it } from 'vitest';

import { buildAdjacency, descendantsOf, findCycle, isReachable } from './topology.ts';

describe('buildAdjacency', () => {
  it('records both directions for every edge', () => {
    const graph = diamondWorkflow();
    const { dependencies, dependents } = buildAdjacency(
      graph.nodes.map((n) => n.id),
      graph.edges,
    );

    expect(dependencies.get('out')).toEqual(new Set(['a', 'b']));
    expect(dependents.get('in')).toEqual(new Set(['a', 'b']));
    expect(dependencies.get('in')?.size).toBe(0);
  });

  it('collapses duplicate edges, so they cannot double a dependency count', () => {
    // A duplicate that survived validation as a warning must not leave `out`
    // waiting for two completions from a node that only reports one.
    const { dependencies } = buildAdjacency(['in', 'out'], [edge('in', 'out', 'e1'), edge('in', 'out', 'e2')]);

    expect(dependencies.get('out')?.size).toBe(1);
  });
});

describe('findCycle', () => {
  it('returns null for a DAG', () => {
    const graph = diamondWorkflow();
    expect(
      findCycle(
        graph.nodes.map((n) => n.id),
        graph.edges,
      ),
    ).toBeNull();
  });

  it('returns the loop itself, not the path that led into it', () => {
    const found = findCycle(['in', 'a', 'b', 'c'], [edge('in', 'a'), edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]);

    expect(found).not.toBeNull();
    expect(new Set(found)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('finds a self-loop', () => {
    expect(findCycle(['a'], [edge('a', 'a')])).not.toBeNull();
  });
});

describe('isReachable', () => {
  const edges = [edge('in', 'a'), edge('a', 'b'), edge('b', 'out')];

  it('follows edges forward, transitively', () => {
    expect(isReachable(edges, 'in', 'out')).toBe(true);
  });

  it('does not follow them backwards', () => {
    expect(isReachable(edges, 'out', 'in')).toBe(false);
  });

  it('terminates on a graph that already contains a cycle', () => {
    expect(isReachable([...edges, edge('out', 'a')], 'in', 'out')).toBe(true);
  });
});

describe('descendantsOf', () => {
  it('collects the whole downstream subtree', () => {
    const graph = diamondWorkflow();
    const { dependents } = buildAdjacency(
      graph.nodes.map((n) => n.id),
      graph.edges,
    );

    expect(new Set(descendantsOf('in', dependents))).toEqual(new Set(['a', 'b', 'out']));
    expect(descendantsOf('out', dependents)).toEqual([]);
  });
});
