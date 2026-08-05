# 0008 — Hand-write payload parsing instead of using a schema library

## Context

`POST /api/runs` accepts an untrusted `Workflow` from the network. Everything
downstream — the validator, the scheduler, the event log — assumes the shape it
gets is real.

The default answer is Zod (or Valibot, or Ajv): declare the schema once, parse at
the boundary, infer the types. It's the right answer most of the time, and the
first version of this code did exactly that.

## Decision

Hand-written parsing in `@repo/workflow/parse.ts` (~140 lines), with types
declared separately in `@repo/types`.

It also draws a line that a single schema pass tends to blur:

| Question                        | Function           | Failure                 |
| ------------------------------- | ------------------ | ----------------------- |
| Is this even a workflow object? | `parseWorkflow`    | `400 malformed_request` |
| Is this graph runnable?         | `validateWorkflow` | `422 invalid_workflow`  |

Those are genuinely different answers to different audiences. A `400` is for
whoever is holding the API and names the exact path
(`workflow.nodes[0].config.operation must be one of: …`). A `422` is for the
person at the canvas and carries `issues[]` that the editor renders as clickable
items. Conflating them means either leaking parser noise into the UI or
accepting `{nodes: "yes"}` deeper into the system than it should get.

## Consequences

- **`@repo/types` and `@repo/workflow` have zero runtime dependencies.** That's
  the main prize: `@repo/workflow` ships to the browser bundle, and it's the
  package whose whole value is being safely runnable in both environments. Not
  pulling a schema library into that bundle for server-side parsing is a real
  win.
- Types are written as plain TypeScript rather than inferred from schemas, so
  `WorkflowNode` reads as a discriminated union in the source instead of as a
  `z.infer<typeof …>` that an editor has to expand.
- The size limits (1000 nodes, 4000 edges, 2000-char values) are explicit
  constants in one table rather than scattered through a chain of `.max()` calls.
- **Cost: it's more code, and it's code I own.** ~140 lines that a dependency
  would have provided, including the boring primitives (`asString`, `asEnum`,
  `asFinite`). Covered by 8 tests, but still a maintenance surface.
- **Cost: it doesn't scale to a large API.** This is defensible for one payload
  shape. At ten endpoints with varied bodies I'd reach for Zod without
  hesitating — the argument here is specifically about a tiny surface and a
  dependency-free shared package, not a general preference.

## Alternatives rejected

**Zod in `@repo/workflow`.** Less code, better ergonomics, and the schema would
double as documentation. Rejected because it would put a runtime dependency
inside the one package that has to stay environment-agnostic and browser-bound,
in exchange for parsing that only ever happens on the server.

**Zod in `apps/api` only, types still hand-written.** Keeps the shared package
clean and gets the ergonomics where the parsing happens. Genuinely the closest
call, and what I'd do if the payload were more complex. Rejected here because it
means the schema and the type are two artefacts that must agree, with nothing
enforcing it — exactly the drift the shared-types package exists to prevent.

**No parsing; trust `validateWorkflow`.** It already walks every node. Rejected
because it's typed against `Workflow` and would read `node.config.operation` off
whatever arrived — a malformed payload would reach the scheduler and fail
somewhere far less obvious than the boundary.
