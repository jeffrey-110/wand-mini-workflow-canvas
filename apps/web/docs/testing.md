# `@repo/web` — tests

**There are none.** That's the largest gap in the repo and it's stated here
rather than buried.

The graph rules this app depends on _are_ covered — 37 tests in
`@repo/workflow`, which is the same module the UI runs for validation and the
connection guard. So the logic with real branching is tested; the React layer
is not.

## What I'd write first, in order

**1. The inspector writes through.** There's no draft state and no Save button,
which is a deliberate product decision — so it needs a test that a keystroke is
immediately observable in `graph.store`, and that switching selection doesn't
carry a stale value across. Testing Library, no network.

**2. One event re-renders one node.** This is the performance claim the entire
state split rests on ([decision 0004](./decisions/0004-two-stores.md)), and
right now it's an argument rather than a fact. A render-count spy on two node
cards while pushing a `node.updated` for one of them would turn it into an
assertion — and would fail loudly if someone later moved run state into
`graph.store` "for convenience".

**3. An end-to-end path.** Playwright: load the example, run it, assert every
node reaches a terminal state. This is the one that would have caught the SSE
`event:` bug — where the stream was flawless in curl and delivered nothing to
the browser, so every server-side test passed while the UI sat frozen. Unit
tests structurally cannot catch that class of bug; only a real browser can.

**4. The reconnect path.** Kill the API mid-run, bring it back, assert the
canvas converges to the correct final state. The server side of this is well
covered; the browser side has only been verified by hand.

## Why not now

The brief scopes out tests beyond what's natural for tricky logic, and the
tricky logic here lives in `@repo/workflow` and `@repo/api`, both of which are
covered. Within a 4–6 hour budget, component tests would have come out of the
streaming and failure-handling work, which is where the brief puts its weight.

That's a defensible trade for a take-home and an indefensible one for a product
— item 2 in particular is a load-bearing claim that currently has no guard.

## Manual verification performed

The run experience was driven end to end in a real browser, not just asserted
against the API:

- Happy path: parallel branches visibly running at the same time, each node
  showing its real output and duration.
- Partial failure: a mid-graph step fails, its descendants go `skipped`, and an
  unrelated branch keeps running to completion.
- Cancellation mid-flight: the in-flight step aborts, queued steps are retired,
  already-succeeded steps keep their results.
- Reconnect: the "Reconnecting…" pill and banner appear when the stream drops.
- Reload: the graph is restored from `localStorage` and a finished run is
  recovered from `sessionStorage` without a pointless reconnect.
