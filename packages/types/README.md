# @repo/types

The wire contract between the API and the web client.

```ts
import type { RunEvent, Workflow, ApiError } from '@repo/types';
```

**Types only, no runtime dependencies, and no build step.** Both consumers run
TypeScript-aware bundlers, so this is consumed as source — nothing to compile,
nothing to keep in sync. It depends on nothing, which is what stops the contract
from importing an implementation.

## Files

| File            | Exports                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `graph.ts`      | `Workflow`, `WorkflowNode`, `WorkflowEdge`, the kind/op/destination unions |
| `run.ts`        | `RunEvent`, `RunSnapshot`, `NodeRunState`, `RunOptions`, status unions     |
| `validation.ts` | `ValidationIssue`, `ValidationResult`, `ValidationCode`                    |
| `api.ts`        | Request/response bodies, `ApiError`                                        |
| `index.ts`      | Barrel — the only path consumers import                                    |

Grouped by **what changes together**, not one type per file: adding a node kind
touches `NodeKind`, the config interfaces and `WorkflowNode` in a single edit, so
they share a file.

## Things worth knowing before editing

**A change here is a change to the wire format.** The API constructs these and
the client consumes them, so a mismatch is a compile error in the UI rather than
a runtime surprise — that's the entire point of the package. Run
`pnpm run typecheck` at the root after editing; it checks every workspace.

**`WorkflowNode` is a discriminated union, deliberately.** Writing it as
`{ kind: NodeKind; config: NodeConfig }` would typecheck and narrow nothing —
every `switch (node.kind)` would leave the config as the union of all three and
need a cast at each read. Correlating them is what lets the inspector and the
node card branch on kind for free.

**`RunEventDraft` uses a distributive `Omit`.** A plain
`Omit<RunEvent, 'seq' | 'at'>` collapses the union down to the keys every member
shares — i.e. just `type` — and silently rejects every event's payload. This is
a real trap; the type is commented in place.

**Named `types`, not `shared`.** `shared` is the kind of name that accumulates
unrelated code. Runtime logic that both sides need lives in `@repo/workflow`,
which depends on this one.
