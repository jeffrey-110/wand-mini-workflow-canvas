/**
 * The workflow graph model and its rules.
 *
 * Depends on `@repo/types` and nothing else — no I/O, no framework, no DOM.
 * That's what lets the browser and the server run the same validator, and the
 * same rules that reject a run also drive the drag-time connection guard.
 */

export { NODE_KIND_META, defaultConfig, nodeLabel, type NodeKindMeta } from './catalog.ts';
export { applyNode, applyTransform } from './execute.ts';
export { ParseError, parseWorkflow } from './parse.ts';
export { buildAdjacency, descendantsOf, findCycle, isReachable, type Adjacency } from './topology.ts';
export { canConnect, validateWorkflow, type ConnectVerdict } from './validation.ts';
