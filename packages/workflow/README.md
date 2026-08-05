# @repo/workflow

The graph model and its rules: parsing, validation, topology, and what a step
does.

```ts
import {
  validateWorkflow,
  canConnect,
  parseWorkflow,
  applyNode,
} from '@repo/workflow';
```

**This package is why the browser and the server can't disagree.** The editor
runs `validateWorkflow` on every edit for instant feedback; the API runs the same
function on every `POST /api/runs` as the authority. One implementation, so
there's nothing to drift.

That property is enforced by the tsconfig, not by discipline: `lib: ["ES2023"]`
and no `types`, so a `node:` import or a `document` reference is a compile error.
No I/O, no framework, no DOM — and zero runtime dependencies, so it costs the
browser bundle almost nothing.

## Files

| File            | Exports                                                       |
| --------------- | ------------------------------------------------------------- |
| `catalog.ts`    | `NODE_KIND_META`, `defaultConfig`, `nodeLabel`                |
| `topology.ts`   | `buildAdjacency`, `findCycle`, `isReachable`, `descendantsOf` |
| `validation.ts` | `validateWorkflow`, `canConnect`                              |
| `parse.ts`      | `parseWorkflow`, `ParseError`                                 |
| `execute.ts`    | `applyNode`, `applyTransform`                                 |

## Things worth knowing before editing

**Parsing and validation answer different questions.** `parseWorkflow` asks "is
this even a workflow object?" and its failures are `400`. `validateWorkflow`
asks "is this graph runnable?" and its failures are `422` with an `issues[]`
array the editor renders. Keeping them apart is what stops parser noise leaking
into the UI. See [decision 0008](../../docs/decisions/0008-hand-written-parsing.md).

**Source/sink rules live in `NODE_KIND_META` as data**, not as
`if (kind === 'input')` scattered across the validator, the connection guard and
the renderer. Adding a fourth kind should be one entry in that table.

**`canConnect` and `validateWorkflow` must agree.** One is a fast per-edge check
run during a drag; the other is the whole-graph authority. Anything the first
permits must pass the second — there's a test asserting exactly that, and it's
the one to keep green if you touch either.

**`buildAdjacency` uses sets on purpose.** Duplicate edges are a _warning_, not
an error, so they reach the scheduler — and counting one twice would double a
node's dependency count and deadlock it.

**Two severities, and the split is a product decision.** Errors block the Run
button; warnings never do. The full table with reasoning is in `validation.ts`
and mirrored in the [root README](../../README.md#validation-rules).
