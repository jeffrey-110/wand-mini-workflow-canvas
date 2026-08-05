/**
 * Test fixtures shared by `@repo/workflow` and `@repo/api`.
 *
 * Depends on `@repo/types` only, so a fixture can't drift toward one app's
 * internals.
 */

export { cyclicWorkflow, diamondWorkflow, edge, linearWorkflow, minimalWorkflow, node, twoChainWorkflow, workflow } from './graph.ts';
