# `@repo/web` — frontend

![The editor: palette, canvas, inspector, and a non-blocking validation warning](../../docs/images/editing.png)

<sub>A freshly added step: selected on drop, its config open in the inspector with
the name field focused, and the issue list already reporting that nothing consumes
it — as a <em>warning</em>, so Run stays enabled.</sub>

## The boundary rule

**A file that imports `@repo/types` or `@repo/workflow` belongs in
`containers/`.** Phrased that way so it can be checked:

```bash
grep -rn "@repo/types\|@repo/workflow" apps/web/src/components/   # must be empty
```

Everything in `components/` therefore renders in isolation with no domain
knowledge — `Pill` takes a `tone: string`, not a `RunStatus`, because mapping a
status to a colour is domain knowledge and this layer doesn't have any.

`Toaster` is the one component that touches a store, because a toast host has to
subscribe to something to exist at all. The store it reads is itself domain-free.

## Layout

```
src/
  components/   domain-agnostic primitives, barrel export
  containers/   domain-aware: canvas, node card, inspector, toolbar, issues
  services/     the network edge
    api.ts              one request(), one tagged error shape
    runs/               runs.api.ts + runs.stream.ts (EventSource lifecycle)
    workflows/          workflows.api.ts
  state/        graph.store · run.store · toast.store
  hooks/        useValidation · useKeyboardShortcuts
  lib/          status.ts — the status → label/glyph/tone table
```

`lib/status.ts` is the single place that decides what a status _means_, so the
node badge, the inspector, the toolbar and the minimap can't drift apart in
wording or colour.

## State

Two stores split by lifetime — the whole reasoning is in
[decision 0004](./decisions/0004-two-stores.md). The short version: a
`node.updated` event touches `run.store` only, each node card subscribes to its
own slice, so **one event re-renders one node**.

Validation is derived, never stored:

```ts
return useMemo(
  () => validateWorkflow(toWorkflow()),
  [nodes, edges, toWorkflow],
);
```

There's no invalidation to forget and no way for the graph and its verdict to
disagree. It runs the _same module_ the server runs — the client copy is for
latency, the server copy is the contract.

## The network edge

`services/api.ts` normalises every failure into one tagged error:

```ts
export interface ApiRequestError extends Error {
  name: 'ApiRequestError';
  code: ApiErrorCode;
  status: number; // 0 when the request never reached the server
  requestId: string | null;
  issues: ApiError['issues'];
}
```

Tagged by `name` rather than modelled as a subclass: `instanceof` silently
returns `false` when a module is loaded twice — duplicate copies in a bundle, an
HMR reload holding an old copy — and this error is checked in exactly those
places. The failure would be silent, since the error still surfaces but its
`code` is never consulted. `isApiRequestError()` is a string comparison and a
proper type guard.

"Server is down" and "server said no" get different `code`s and different copy,
because conflating them produces misleading error text.

`services/runs/runs.stream.ts` wraps `EventSource`. It's deliberately thin —
almost all of the reconnection work isn't there, which is the point of choosing
SSE. Its one real addition is the `lastEventId` query parameter, needed because
`EventSource` has no API for setting a header on a _fresh_ connection, which is
what a manual re-attach after a page reload is.

## Reload recovery

The run id and cursor are mirrored into `sessionStorage` — not `localStorage`,
because a run belongs to this tab's session and restoring one in a new window a
day later would be a ghost, not a feature.

On mount, `restore()` fetches `GET /api/runs/:id` **before** opening a stream.
That way a run that finished while the tab was away shows its result without a
pointless reconnect, and an expired run drops its cursor instead of showing
something that isn't there.

## UX decisions worth naming

**No draft state in the inspector.** Edits write through on every keystroke;
there is no Save button. A builder where changes might or might not have stuck is
a builder people stop trusting.

**Editing is locked during a run.** There's no sane answer to "you deleted a node
that is currently running", so the graph is read-only in flight. Panning, zooming
and selection still work, and every disabled control says why on hover.

**Illegal edges are refused, not flagged.** `isValidConnection` runs live during
the drag, so an illegal target won't accept the drop. But a rule you can't see is
a rule you'll fight, so `onConnectEnd` explains the refusal in a toast — only
when the user actually dropped on a node, since dropping on empty canvas is a
cancel, not a mistake.

**Issues are clickable and pan the canvas.** A list of problems you then have to
_find_ is only half a feature once the graph is bigger than the viewport.

**Failure rate is a product control, not a debug flag.** Execution is simulated;
"watch a failure propagate" shouldn't require pressing Run until the dice
cooperate.

**Toasts are only for things that stop being true.** Anything that stays true —
validation errors, a failed run — lives in the layout, not in something that
vanishes before it's read.

## Styling

One stylesheet, no CSS-in-JS and no utility framework. The app is one screen with
a fixed three-column layout; a component library would be more configuration than
code.

Everything runtime-variable is a `data-` attribute styled in CSS
(`data-status`, `data-kind`, `data-tone`), which keeps colour decisions out of
the components and makes the whole palette greppable in one file. Dark-first with
a `prefers-color-scheme` light variant, and `prefers-reduced-motion` turns off
the pulse and the edge-flow animation.

## Known gaps

- **No tests.** The two I'd write first are in
  [testing.md](./testing.md).
- Validation runs on the render path on every keystroke. Fine here; at 500 nodes
  it moves to a trailing debounce off the render path.
- No undo/redo — the biggest missing editor feature, and the state shape supports
  it as middleware rather than a rewrite.
- The three-column layout collapses below 1040px but was not designed for small
  screens; this is a desktop tool.
