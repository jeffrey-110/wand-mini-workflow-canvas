import type { TransformOp, WorkflowNode } from '@repo/types';

/**
 * What a step actually *does* — pure, synchronous, and deliberately trivial.
 *
 * The exercise is about orchestration, not about the work. But having a real
 * value flow down the graph makes a run inspectable (every node shows what it
 * produced, and the inspector can prove the wiring was right) instead of a
 * light show that would look identical if the edges were wrong.
 *
 * Lives in `@repo/workflow` rather than in the API so the semantics sit beside
 * the rules that constrain them, and so the editor could preview a step's
 * output without a round trip.
 */
export function applyNode(node: WorkflowNode, inbound: readonly string[]): string {
  switch (node.kind) {
    case 'input':
      return node.config.value;
    case 'transform':
      // Multiple upstreams fan in as a space-joined string. A real engine would
      // have named ports; that's out of scope and called out in the README.
      return applyTransform(node.config.operation, inbound.join(' '), node.config.prefix);
    case 'output':
      return inbound.join(' ');
  }
}

export function applyTransform(operation: TransformOp, value: string, prefix: string): string {
  switch (operation) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    case 'reverse':
      // Spread, not `split('')`: surrogate pairs would be torn apart otherwise.
      return [...value].reverse().join('');
    case 'slugify':
      return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    case 'prefix':
      return `${prefix}${value}`;
  }
}
