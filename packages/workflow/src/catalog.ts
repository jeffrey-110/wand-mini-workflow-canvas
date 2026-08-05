import type { NodeConfig, NodeKind } from '@repo/types';

/**
 * What each node kind *is*, in one table.
 *
 * `acceptsInbound` / `emitsOutbound` are the source-and-sink rules expressed as
 * data rather than as `if (kind === 'input')` scattered across the validator,
 * the connection guard, and the node renderer. Adding a fourth kind means one
 * entry here, not a search for every place that special-cases a kind.
 */
export interface NodeKindMeta {
  title: string;
  blurb: string;
  /** False for graph sources: nothing may connect *into* them. */
  acceptsInbound: boolean;
  /** False for graph sinks: nothing may connect *out of* them. */
  emitsOutbound: boolean;
}

export const NODE_KIND_META: Record<NodeKind, NodeKindMeta> = {
  input: {
    title: 'Input',
    blurb: 'Seeds the run with a value.',
    acceptsInbound: false,
    emitsOutbound: true,
  },
  transform: {
    title: 'Transform',
    blurb: 'Rewrites the value coming in.',
    acceptsInbound: true,
    emitsOutbound: true,
  },
  output: {
    title: 'Output',
    blurb: 'Delivers the final value somewhere.',
    acceptsInbound: true,
    emitsOutbound: false,
  },
};

export function defaultConfig<K extends NodeKind>(kind: K): NodeConfig<K> {
  switch (kind) {
    case 'input':
      return { label: 'Input', value: 'hello wand' } as NodeConfig<K>;
    case 'transform':
      return { label: 'Transform', operation: 'uppercase', prefix: '' } as NodeConfig<K>;
    default:
      return { label: 'Output', destination: 'console' } as NodeConfig<K>;
  }
}

/** Display name for a node, falling back to its kind when unnamed. */
export function nodeLabel(node: { kind: NodeKind; config: { label: string } } | undefined): string {
  if (!node) return 'unknown';
  return node.config.label.trim() || NODE_KIND_META[node.kind].title;
}
