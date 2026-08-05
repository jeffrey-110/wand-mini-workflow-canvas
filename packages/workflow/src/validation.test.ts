import { cyclicWorkflow, diamondWorkflow, edge, linearWorkflow, node, workflow } from '@repo/factories';
import type { ValidationCode, Workflow } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { canConnect, validateWorkflow } from './validation.ts';

/**
 * The graph rules are the part of this system with real logic and no visible
 * failure mode — a validator that is subtly too permissive shows up as a
 * deadlocked run much later. So they're covered directly.
 */

function codes(graph: Workflow): ValidationCode[] {
  return validateWorkflow(graph).issues.map((issue) => issue.code);
}

describe('validateWorkflow', () => {
  it('accepts a straight input → transform → output graph with nothing to report', () => {
    const result = validateWorkflow(linearWorkflow());

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts parallel branches that converge', () => {
    expect(validateWorkflow(diamondWorkflow()).valid).toBe(true);
  });

  it('rejects an empty graph with one actionable message', () => {
    const result = validateWorkflow(workflow([]));

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe('EMPTY_GRAPH');
  });

  it('reports a cycle once, naming the nodes on it', () => {
    const cycles = validateWorkflow(cyclicWorkflow()).issues.filter((issue) => issue.code === 'CYCLE');

    expect(cycles).toHaveLength(1);
    // The message drives the highlight, so it must name the loop and not the
    // whole path that led into it.
    expect(new Set(cycles[0]?.nodeIds)).toEqual(new Set(['a', 'b']));
  });

  it('rejects an edge into an Input, which is a graph source', () => {
    const graph = workflow([node('a', 'input'), node('b', 'input'), node('c', 'output')], [edge('a', 'b'), edge('a', 'c')]);

    expect(codes(graph)).toContain('INBOUND_INTO_SOURCE');
    expect(validateWorkflow(graph).valid).toBe(false);
  });

  it('rejects an edge out of an Output, which is a graph sink', () => {
    const graph = workflow([node('a', 'input'), node('b', 'output'), node('c', 'output')], [edge('a', 'b'), edge('b', 'c')]);

    expect(codes(graph)).toContain('OUTBOUND_FROM_SINK');
  });

  it('rejects a step with nothing upstream, because it could never run', () => {
    const graph = workflow([node('in', 'input'), node('orphan', 'transform'), node('out', 'output')], [edge('in', 'out')]);
    const issue = validateWorkflow(graph).issues.find((i) => i.code === 'UNREACHABLE_NODE');

    expect(issue?.nodeIds).toEqual(['orphan']);
    expect(issue?.severity).toBe('error');
  });

  it('requires both a start and an end', () => {
    expect(codes(workflow([node('a', 'transform')], []))).toContain('NO_INPUT');
    expect(codes(workflow([node('a', 'input')], []))).toContain('NO_OUTPUT');
  });

  it('warns — but still runs — when a transform result goes nowhere', () => {
    const graph = workflow([node('in', 'input'), node('spare', 'transform'), node('out', 'output')], [edge('in', 'spare'), edge('in', 'out')]);
    const result = validateWorkflow(graph);

    expect(result.valid).toBe(true);
    expect(result.issues.find((i) => i.code === 'DEAD_END_NODE')?.severity).toBe('warning');
  });

  it('warns on a duplicate connection rather than blocking it', () => {
    const graph = workflow([node('in', 'input'), node('out', 'output')], [edge('in', 'out', 'e1'), edge('in', 'out', 'e2')]);
    const result = validateWorkflow(graph);

    expect(result.valid).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('DUPLICATE_EDGE');
  });

  it('warns on configs that are legal but almost certainly unintended', () => {
    const graph = workflow(
      [node('in', 'input', { value: '   ' }), node('t', 'transform', { operation: 'prefix', prefix: '' }), node('out', 'output')],
      [edge('in', 't'), edge('t', 'out')],
    );
    const result = validateWorkflow(graph);

    expect(result.valid).toBe(true);
    expect(codes(graph)).toEqual(expect.arrayContaining(['EMPTY_INPUT_VALUE', 'MISSING_PREFIX']));
  });

  it('flags an edge pointing at a node that no longer exists', () => {
    const graph = workflow([node('in', 'input'), node('out', 'output')], [edge('in', 'out'), edge('in', 'ghost')]);

    expect(codes(graph)).toContain('DANGLING_EDGE');
  });

  it('flags a self-loop without letting it reach cycle detection', () => {
    const graph = workflow([node('in', 'input'), node('t', 'transform'), node('out', 'output')], [edge('in', 't'), edge('t', 't'), edge('t', 'out')]);
    const found = codes(graph);

    expect(found).toContain('SELF_LOOP');
    // Reported as the specific thing it is, not as a generic cycle.
    expect(found).not.toContain('CYCLE');
  });
});

describe('canConnect', () => {
  const graph = workflow([node('in', 'input'), node('a', 'transform'), node('b', 'transform'), node('out', 'output')], [edge('in', 'a'), edge('a', 'b')]);

  it('refuses an edge that would close a loop', () => {
    // `a → b` already exists, so `b → a` closes one.
    expect(canConnect(graph, 'b', 'a')).toEqual({ ok: false, reason: 'That would create a cycle.' });
  });

  it('reports the source/sink rule ahead of the cycle rule when both apply', () => {
    // `b → in` is both a cycle and an edge into a source. The direction rule is
    // the more specific explanation, so it wins.
    expect(canConnect(graph, 'b', 'in')).toEqual({ ok: false, reason: 'Input steps start a workflow — nothing can feed into them.' });
  });

  it('refuses a duplicate of an existing connection', () => {
    expect(canConnect(graph, 'a', 'b')).toEqual({ ok: false, reason: 'These steps are already connected.' });
  });

  it('refuses self-connection', () => {
    expect(canConnect(graph, 'a', 'a').ok).toBe(false);
  });

  it('enforces source and sink direction', () => {
    expect(canConnect(graph, 'out', 'a').ok).toBe(false);
    expect(canConnect(graph, 'a', 'in').ok).toBe(false);
  });

  it('allows a new edge that keeps the graph acyclic', () => {
    expect(canConnect(graph, 'b', 'out')).toEqual({ ok: true });
    expect(canConnect(graph, 'in', 'b')).toEqual({ ok: true });
  });

  it('agrees with validateWorkflow — anything it permits still validates', () => {
    const verdict = canConnect(graph, 'b', 'out');
    expect(verdict.ok).toBe(true);

    const next = workflow(graph.nodes, [...graph.edges, edge('b', 'out')]);
    expect(validateWorkflow(next).valid).toBe(true);
  });
});
