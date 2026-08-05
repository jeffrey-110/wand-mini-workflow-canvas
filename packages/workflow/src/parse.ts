import { NODE_KINDS, OUTPUT_DESTINATIONS, TRANSFORM_OPS, type Position, type Workflow, type WorkflowEdge, type WorkflowNode } from '@repo/types';

/**
 * Structural parsing of an untrusted `Workflow` payload.
 *
 * Distinct from `validateWorkflow`, and the split matters: this answers "is this
 * even a workflow object?" and its failures are `400 malformed_request`, while
 * validation answers "is this graph runnable?" and its failures are `422
 * invalid_workflow` with a list the editor can render. Conflating them means
 * either leaking parser noise into the UI or accepting `{nodes: "yes"}` far
 * enough into the system to crash somewhere less obvious.
 *
 * Hand-written rather than schema-library-driven: it is ~80 lines, it keeps
 * `@repo/workflow` dependency-free, and it makes the size limits explicit
 * instead of hidden in a chain of chained validators.
 */

export class ParseError extends Error {
  // Assigned in the body rather than as a constructor parameter property: those
  // emit code rather than erasing, and Node's type stripping rejects them.
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = 'ParseError';
    this.path = path;
  }
}

const LIMITS = {
  nodes: 1_000,
  edges: 4_000,
  label: 80,
  value: 2_000,
  prefix: 200,
  name: 120,
} as const;

export function parseWorkflow(input: unknown): Workflow {
  const root = asRecord(input, 'workflow');

  if (root.version !== 1) {
    throw new ParseError('workflow.version', `Unsupported workflow version ${JSON.stringify(root.version)}; this server speaks version 1.`);
  }

  const nodes = asArray(root.nodes, 'workflow.nodes', LIMITS.nodes).map(parseNode);
  const edges = asArray(root.edges, 'workflow.edges', LIMITS.edges).map(parseEdge);

  return {
    version: 1,
    name: typeof root.name === 'string' ? root.name.slice(0, LIMITS.name) : 'Untitled workflow',
    nodes,
    edges,
  };
}

function parseNode(input: unknown, index: number): WorkflowNode {
  const path = `workflow.nodes[${index}]`;
  const node = asRecord(input, path);

  const id = asId(node.id, `${path}.id`);
  const kind = asEnum(node.kind, NODE_KINDS, `${path}.kind`);
  const position = parsePosition(node.position, `${path}.position`);
  const config = asRecord(node.config, `${path}.config`);
  const label = asString(config.label, `${path}.config.label`, LIMITS.label);

  switch (kind) {
    case 'input':
      return { id, kind, position, config: { label, value: asString(config.value, `${path}.config.value`, LIMITS.value) } };
    case 'transform':
      return {
        id,
        kind,
        position,
        config: {
          label,
          operation: asEnum(config.operation, TRANSFORM_OPS, `${path}.config.operation`),
          // Optional: only the `prefix` operation reads it, and switching away
          // from that operation shouldn't require the field to be sent.
          prefix: config.prefix === undefined ? '' : asString(config.prefix, `${path}.config.prefix`, LIMITS.prefix),
        },
      };
    case 'output':
      return { id, kind, position, config: { label, destination: asEnum(config.destination, OUTPUT_DESTINATIONS, `${path}.config.destination`) } };
  }
}

function parseEdge(input: unknown, index: number): WorkflowEdge {
  const path = `workflow.edges[${index}]`;
  const edge = asRecord(input, path);

  return {
    id: asId(edge.id, `${path}.id`),
    source: asId(edge.source, `${path}.source`),
    target: asId(edge.target, `${path}.target`),
  };
}

function parsePosition(input: unknown, path: string): Position {
  const position = asRecord(input, path);
  return { x: asFinite(position.x, `${path}.x`), y: asFinite(position.y, `${path}.y`) };
}

// --- Primitives -------------------------------------------------------------

function asRecord(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ParseError(path, `${path} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function asArray(input: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(input)) throw new ParseError(path, `${path} must be an array.`);
  if (input.length > max) throw new ParseError(path, `${path} may hold at most ${max} entries.`);
  return input;
}

function asString(input: unknown, path: string, max: number): string {
  if (typeof input !== 'string') throw new ParseError(path, `${path} must be a string.`);
  if (input.length > max) throw new ParseError(path, `${path} must be ${max} characters or fewer.`);
  return input;
}

function asId(input: unknown, path: string): string {
  const value = asString(input, path, 200);
  if (value === '') throw new ParseError(path, `${path} must not be empty.`);
  return value;
}

function asFinite(input: unknown, path: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new ParseError(path, `${path} must be a finite number.`);
  return input;
}

function asEnum<T extends string>(input: unknown, allowed: readonly T[], path: string): T {
  if (typeof input !== 'string' || !allowed.includes(input as T)) {
    throw new ParseError(path, `${path} must be one of: ${allowed.join(', ')}.`);
  }
  return input as T;
}
