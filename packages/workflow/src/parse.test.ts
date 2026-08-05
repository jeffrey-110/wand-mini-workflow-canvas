import { linearWorkflow, node, workflow } from '@repo/factories';
import { describe, expect, it } from 'vitest';

import { ParseError, parseWorkflow } from './parse.ts';

/**
 * Parsing is the trust boundary — everything downstream assumes the shape it
 * produces. These cover the cases where being lax would push a bad value deeper
 * into the system than it should get.
 */
describe('parseWorkflow', () => {
  it('round-trips a well-formed workflow unchanged', () => {
    const input = linearWorkflow();
    // Through JSON rather than a structured clone: that's the trip the payload
    // actually makes, and this package declares no host environment, so
    // `structuredClone` isn't in scope here by design.
    expect(parseWorkflow(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('rejects a version it does not speak', () => {
    expect(() => parseWorkflow({ ...linearWorkflow(), version: 2 })).toThrow(ParseError);
  });

  it('names the exact path that failed, so the 400 is actionable', () => {
    const bad = workflow([{ ...node('a', 'input'), position: { x: 0, y: Number.NaN } }]);

    expect(() => parseWorkflow(bad)).toThrow(/workflow\.nodes\[0\]\.position\.y/);
  });

  it('rejects an unknown transform operation rather than defaulting it', () => {
    const bad = workflow([node('a', 'transform', { operation: 'destroy' as never })]);

    // Silently coercing to `uppercase` would run a workflow the user didn't ask for.
    expect(() => parseWorkflow(bad)).toThrow(/must be one of/);
  });

  it('defaults an omitted prefix, since only one operation reads it', () => {
    const input = workflow([{ ...node('a', 'transform'), config: { label: 'T', operation: 'uppercase' } as never }]);

    expect(parseWorkflow(input).nodes[0]?.config).toEqual({ label: 'T', operation: 'uppercase', prefix: '' });
  });

  it('rejects non-objects and non-arrays where structure is required', () => {
    expect(() => parseWorkflow(null)).toThrow(ParseError);
    expect(() => parseWorkflow({ version: 1, nodes: 'yes', edges: [] })).toThrow(/must be an array/);
    expect(() => parseWorkflow({ version: 1, nodes: [1], edges: [] })).toThrow(/must be an object/);
  });

  it('caps collection sizes so an oversized payload fails fast', () => {
    const many = Array.from({ length: 1_001 }, (_, index) => node(`n${index}`, 'input'));

    expect(() => parseWorkflow(workflow(many))).toThrow(/at most 1000/);
  });

  it('rejects an empty id, which would collide with every other empty id', () => {
    expect(() => parseWorkflow(workflow([node('', 'input')]))).toThrow(/must not be empty/);
  });
});
