# 0007 — Keep a per-run event log, and never infer run state on the client

## Context

The client needs to show live per-node status. The obvious implementation is:
server holds current state, pushes deltas, client applies them. That works right
up until a connection drops — and the brief explicitly asks about a tab
reconnecting mid-run.

Once you admit a client can miss events, "apply deltas to local state" has no
answer for the gap. The usual patches are all bad: refetch everything on every
reconnect (loses the point of streaming), or have the client guess and reconcile
later (the UI and the server disagree and the user can't tell which is lying).

There's a second, related question: when the user clicks Cancel, should the UI
flip statuses immediately?

## Decision

**Two rules.**

_The server keeps an append-only event log per run, not just current state._
`seq` is assigned in exactly one place — `RunStore.emit` — which is what
guarantees it's monotonic and gap-free. Subscribing returns a backlog plus a
live feed, and the backlog is chosen by the client's cursor:

```ts
const canReplay = afterSeq !== null && afterSeq <= run.seq;
const backlog = canReplay
  ? run.events.filter((event) => event.seq > afterSeq) // resume
  : [snapshotEvent()]; // fresh or too stale
```

_The client folds that log and infers nothing._ No optimistic status changes —
not even on cancel. Clicking Cancel sets `isCanceling`, an obviously-local flag
that only affects the button's label; which nodes actually stopped is decided by
the scheduler and arrives as events.

Registering the subscriber and reading the backlog happen in one synchronous
block, so an event emitted mid-attach lands in exactly one of the two — never
neither.

## Consequences

- Reconnect, late-join and page-reload recovery are all the same operation with
  a different cursor. There is no separate code path for any of them.
- A client that's been away a long time gets a single snapshot instead of a
  replay of hundreds of events — the `canReplay` fallback handles both "no
  cursor" and "cursor from another run".
- The UI can't drift from the server, because it has no independent state to
  drift with. What you see is what the server said, in order.
- The log is the right foundation for durable execution later: appending to
  storage before fanning out turns `RunStore` into an outbox without changing
  its interface.
- **Cost: memory.** Every event is retained for the run's lifetime. Bounded here
  by a TTL sweeper and a retention cap, and each run is a handful of events. At
  500 nodes it's ~1500 events per run, still small — but this is the thing that
  would need compaction, not the current-state map.
- **Cost: cancel doesn't feel instant.** There's a round trip plus one event
  before the canvas changes. Deliberate: a fake immediate response that a
  reconnect could contradict is worse than a real one 50ms later, and the button
  changing to "Canceling…" carries the feedback.

## Alternatives rejected

**Current state + deltas, no log.** Less memory, simpler store. Has no answer
for a missed event, which is the whole problem.

**Refetch the snapshot on every reconnect.** Correct, and it's what the code
falls back to when there's no usable cursor. Rejected as the _primary_ path
because it throws away the ordering information the client already has, and
makes a one-second network blip cost a full state transfer.

**Optimistic cancel.** Snappier. Rejected because the run genuinely might have
finished a millisecond earlier — the API returns `409` for exactly that race —
and a UI that had already painted "canceled" would then have to take it back.

## Note

The transport detail that makes this work is in
[0002](./0002-sse-over-websocket.md): the `id:` on each SSE frame is what the
browser echoes back as `Last-Event-ID`, so the resume cursor arrives for free.
