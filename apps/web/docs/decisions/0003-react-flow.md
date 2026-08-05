# 0003 — Use React Flow, and let it own only interaction

## Context

The brief allows either a canvas/graph library or raw SVG, and asks for the
tradeoff plus "how your abstraction would hold up as node count and interaction
complexity grow".

Against a 4–6 hour budget, hand-rolling pan, zoom, hit-testing, drag, edge
routing and handle geometry is 2–3 hours of the budget spent on the part of the
problem that is _least_ related to what's being evaluated — streaming state,
the frontend/backend seam, and product judgement.

## Decision

React Flow (`@xyflow/react`), with a hard rule: **it owns interaction and
decides nothing.**

- The authored graph lives in `graph.store`.
- Run state lives in `run.store`.
- The rules live in `@repo/workflow`, shared with the server.
- React Flow is given nodes, edges and callbacks. It is never asked a question
  whose answer matters.

React Flow's node/edge _shape_ is the storage format rather than a parallel
domain model kept in sync — one representation, converted to the wire `Workflow`
at the boundary in `toWorkflow()`. Two representations would mean reconciliation,
and reconciliation means drift.

## Consequences

- Pan, zoom, minimap, selection, edge routing and the drag-to-connect
  interaction all work properly, including the fiddly parts (`screenToFlowPosition`
  for drops, `isValidConnection` running live during a drag).
- `isValidConnection` is what makes the connection rules _felt_ rather than
  read: an illegal edge is refused at the drop rather than created and then
  flagged in a list.
- **Replacing it is bounded and nameable**: `WorkflowCanvas`, `WorkflowNodeCard`,
  `WorkflowEdgeLine`, and `toWorkflow()`. Not the store, not the rules, not the
  wire format. That's the answer to "what if this library becomes a problem".
- **Cost: a real dependency owning the interaction layer**, including its
  conventions. One of them bit — see the note below.
- **Cost: less to show for interaction craft.** Hand-rolled SVG would demonstrate
  more raw capability; this demonstrates judgement about where the budget goes.
  That's the trade, made deliberately.

## How it holds up as node count grows

The scaling risk with any canvas library is that streaming updates re-render
everything. That's addressed structurally, not by React Flow:

- The node array React Flow diffs **never changes during a run**, because run
  state lives in a different store.
- Each node card is `memo`'d and subscribes to its own slice via
  `useNodeRunState(id)`, so one event re-renders one card.

Streaming is therefore O(events), not O(events × nodes). The next thing to give
would be React Flow rendering every node in the viewport at once — and the fix
for that is its `onlyRenderVisibleElements` prop, i.e. a prop, not a rewrite.

The part that would need real work at 500 nodes is validation, which currently
runs O(V+E) on the render path per keystroke.

## Alternatives rejected

**Raw SVG / canvas.** Full control, no dependency, and a stronger signal on
interaction complexity. Rejected on budget: the 2–3 hours it costs would come
directly out of the streaming and failure-handling work, which is where the
brief puts its weight.

**A different graph library** (Cytoscape, D3-force, Rete). Cytoscape and D3 are
built for _visualising_ graphs, not editing them — node-with-form-fields is
awkward in both. Rete is closer in intent but a heavier abstraction that wants
to own the data model too, which is exactly the thing this decision keeps.

## Note — a trap worth recording

React Flow renders each node with the class `react-flow__node-${type}`, and it
ships built-in styles for the type names `input`, `default`, `output` and
`group`. Naming our node types after our node kinds (`input`, `transform`,
`output`) meant Input and Output silently inherited React Flow's default white
card _underneath_ ours — and only those two, which made it look like a rendering
glitch rather than a name collision.

Fixed structurally rather than with a CSS override: there is now one node type,
`WORKFLOW_NODE_TYPE = 'workflow'`, and `data.kind` drives appearance. A
`localStorage` migration rewrites the type for graphs saved before the fix.
