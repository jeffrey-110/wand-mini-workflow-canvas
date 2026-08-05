import type { NodeConfig, NodeKind, Workflow, WorkflowEdge, WorkflowNode } from '@repo/types';

/**
 * Graph fixtures.
 *
 * Every builder returns a *valid* object by default and takes an override, so a
 * test names only the thing it is about: `node('a', 'input', { value: '' })`
 * reads as "an input with no value", and the reader doesn't have to diff it
 * against a wall of boilerplate to spot what's being tested.
 *
 * Depends on `@repo/types` only — a fixture that reached into an app's
 * internals would stop being a fixture and start being a second implementation.
 */

const DEFAULTS: { [K in NodeKind]: NodeConfig<K> } = {
  input: { label: 'Input', value: 'seed' },
  transform: { label: 'Transform', operation: 'uppercase', prefix: '' },
  output: { label: 'Output', destination: 'console' },
};

export function node<K extends NodeKind>(id: string, kind: K, config: Partial<NodeConfig<K>> = {}): WorkflowNode {
  return {
    id,
    kind,
    position: { x: 0, y: 0 },
    config: { ...DEFAULTS[kind], ...config },
  } as WorkflowNode;
}

export function edge(source: string, target: string, id = `${source}->${target}`): WorkflowEdge {
  return { id, source, target };
}

export function workflow(nodes: WorkflowNode[], edges: WorkflowEdge[] = [], name = 'fixture'): Workflow {
  return { version: 1, name, nodes, edges };
}

/** `in → out`. The smallest thing that is a legal workflow. */
export function minimalWorkflow(): Workflow {
  return workflow([node('in', 'input'), node('out', 'output')], [edge('in', 'out')]);
}

/** `in → a → out`. One of everything, in a line. */
export function linearWorkflow(): Workflow {
  return workflow([node('in', 'input'), node('a', 'transform'), node('out', 'output')], [edge('in', 'a'), edge('a', 'out')]);
}

/**
 * ```
 *        ┌── a ──┐
 *   in ──┤       ├── out
 *        └── b ──┘
 * ```
 * `a` and `b` have no ordering between them, so the scheduler must run them
 * concurrently. This is the fixture most execution tests want.
 */
export function diamondWorkflow(): Workflow {
  return workflow(
    [node('in', 'input'), node('a', 'transform'), node('b', 'transform'), node('out', 'output')],
    [edge('in', 'a'), edge('in', 'b'), edge('a', 'out'), edge('b', 'out')],
  );
}

/** Two disjoint chains, so a failure in one can be shown not to touch the other. */
export function twoChainWorkflow(): Workflow {
  return workflow(
    [node('in1', 'input'), node('bad', 'transform'), node('out1', 'output'), node('in2', 'input'), node('good', 'transform'), node('out2', 'output')],
    [edge('in1', 'bad'), edge('bad', 'out1'), edge('in2', 'good'), edge('good', 'out2')],
  );
}

/** `in → a → b → a`: a cycle the validator must catch. */
export function cyclicWorkflow(): Workflow {
  return workflow(
    [node('in', 'input'), node('a', 'transform'), node('b', 'transform'), node('out', 'output')],
    [edge('in', 'a'), edge('a', 'b'), edge('b', 'a'), edge('b', 'out')],
  );
}
