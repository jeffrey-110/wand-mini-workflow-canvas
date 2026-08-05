# 0004 — Two stores split by lifetime, not by feature

## Context

The canvas has two kinds of state that look similar and behave nothing alike:

- **The authored graph.** Changes when the user does something. Maybe a few
  changes per minute. Worth persisting.
- **Live run state.** Changes when an event arrives. Many changes per second
  during a run. Completely disposable.

The default instinct is one store for "the workflow", holding both — a node
object carrying its config _and_ its current status. That reads naturally and is
how the data is presented on screen.

It's also the decision that determines whether the canvas stays usable during a
run.

## Decision

Two Zustand stores, split by **lifetime**:

| Store         | Owner            | Changes on  | Persisted    |
| ------------- | ---------------- | ----------- | ------------ |
| `graph.store` | the user         | user intent | localStorage |
| `run.store`   | the event stream | every event | no           |

Node components read from both, but through different mechanisms:

```tsx
// graph state: arrives as props, changes only when the user edits
function WorkflowNodeCardImpl({ id, data, selected }: NodeProps<AppNode>) {
  // run state: a per-node subscription
  const runState = useNodeRunState(id);
```

with `useNodeRunState` selecting a single entry:

```ts
export function useNodeRunState(nodeId: string) {
  return useRunStore((state) => state.nodeStates[nodeId]);
}
```

and the reducer replacing only the entry that changed:

```ts
nodeStates: { ...state.nodeStates, [event.state.nodeId]: event.state }
```

## Consequences

- **A `node.updated` event re-renders exactly one node card.** Every other entry
  in `nodeStates` keeps its identity, so those selectors return a referentially
  equal value and React bails out. The node array React Flow diffs doesn't change
  at all during a run.
- Streaming cost is O(events), not O(events × nodes) — the property the 500-node
  answer rests on.
- Persistence is trivially correct: `graph.store` is exactly the persistable
  thing, so `partialize` is one line and there's no risk of writing run state to
  disk.
- Clearing a run is `run.store.dismiss()` and cannot touch the graph. Clearing
  the graph cannot orphan a run.
- **Cost: node status isn't on the node object**, so anything wanting both has to
  read both. Mildly unnatural to write — `WorkflowNodeCard` and `StepInspector`
  each pull from two places. That's the price, and it's paid in two files.
- **Cost: two stores to reason about** rather than one, and a reader has to learn
  the split before the code makes sense. Hence this record.

## Alternatives rejected

**One store, status on the node.** The natural-reading option. Rejected because
every event would produce a new node array, React Flow would diff the whole
graph, and every node would re-render — at 500 nodes and a few events a second,
that's the canvas becoming unusable exactly when the user most wants to watch it.

**Run state in React `useState`, lifted to a common parent.** Works, and avoids
a second store. Rejected because the common parent is the whole app, so every
event re-renders the whole tree — the same problem with more prop drilling.

**React Query for run state.** Already a natural fit for the POSTs. Rejected
because the run isn't request/response — it's a stream folded into a reducer,
which is not what the cache is for. The two commands (`createRun`, `cancelRun`)
are single `await` calls in a store action and don't need a cache, retry policy
or invalidation. Adding it would mean two state systems where one does the job.

## Note

The same reasoning drives `WorkflowEdgeLine`: it subscribes to a derived string
(`'flowing' | 'done' | 'dead' | 'idle'`) computed from its two endpoints, so an
event that doesn't change _that edge's_ state is referentially equal and skips
the re-render.
