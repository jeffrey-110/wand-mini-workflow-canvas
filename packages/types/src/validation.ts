/**
 * The shape of a validation result. The *rules* live in `@repo/workflow`; only
 * the vocabulary lives here, so the API's error envelope and the editor's issue
 * list are typed against the same thing.
 */

export type IssueSeverity = 'error' | 'warning';

export type ValidationCode =
  | 'EMPTY_GRAPH'
  | 'DUPLICATE_NODE_ID'
  | 'DANGLING_EDGE'
  | 'SELF_LOOP'
  | 'DUPLICATE_EDGE'
  | 'CYCLE'
  | 'INBOUND_INTO_SOURCE'
  | 'OUTBOUND_FROM_SINK'
  | 'NO_INPUT'
  | 'NO_OUTPUT'
  | 'UNREACHABLE_NODE'
  | 'DEAD_END_NODE'
  | 'EMPTY_INPUT_VALUE'
  | 'MISSING_PREFIX';

export interface ValidationIssue {
  code: ValidationCode;
  severity: IssueSeverity;
  message: string;
  /** Nodes to highlight, and what "jump to issue" focuses on. */
  nodeIds?: string[];
  edgeIds?: string[];
}

export interface ValidationResult {
  /** False when at least one issue is an `error`. Warnings never block a run. */
  valid: boolean;
  issues: ValidationIssue[];
}
