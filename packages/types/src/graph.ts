/**
 * The workflow graph — what the user authors and the API executes.
 *
 * Three node kinds, chosen so each exercises a different part of the editor:
 * `input` is a graph source with a free-text config, `transform` has a dropdown
 * *and* a conditional field, `output` is a graph sink. The specifics are
 * deliberately boring; the interesting part is the topology.
 */

export const NODE_KINDS = ['input', 'transform', 'output'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const TRANSFORM_OPS = ['uppercase', 'lowercase', 'reverse', 'slugify', 'prefix'] as const;
export type TransformOp = (typeof TRANSFORM_OPS)[number];

export const OUTPUT_DESTINATIONS = ['console', 'webhook', 'datastore'] as const;
export type OutputDestination = (typeof OUTPUT_DESTINATIONS)[number];

export interface Position {
  x: number;
  y: number;
}

export interface InputConfig {
  label: string;
  /** Seed payload the run starts from. */
  value: string;
}

export interface TransformConfig {
  label: string;
  operation: TransformOp;
  /** Only meaningful when `operation` is `prefix`; kept so switching ops is non-destructive. */
  prefix: string;
}

export interface OutputConfig {
  label: string;
  destination: OutputDestination;
}

/**
 * Discriminated on `kind`, so narrowing a node narrows its config. This is the
 * reason the editor can render three different inspectors without a cast at
 * every field.
 */
export type WorkflowNode =
  | { id: string; kind: 'input'; position: Position; config: InputConfig }
  | { id: string; kind: 'transform'; position: Position; config: TransformConfig }
  | { id: string; kind: 'output'; position: Position; config: OutputConfig };

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  /** Bumped when the wire format changes; the API rejects versions it doesn't know. */
  version: 1;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** `Extract` over the union, spelled once. */
export type NodeOfKind<K extends NodeKind> = Extract<WorkflowNode, { kind: K }>;
export type NodeConfig<K extends NodeKind = NodeKind> = NodeOfKind<K>['config'];
