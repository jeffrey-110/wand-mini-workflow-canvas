# `@repo/web` — tests

**No component tests here. The app is covered end to end instead**, by 19
Playwright tests in [`@repo/e2e`](../../e2e/README.md) that drive this UI in a
real browser against the real API.

That is a deliberate ordering, not an accident. The bug that cost the most time
in this build — an `event:` line on the SSE frames, which makes `EventSource`
dispatch a typed event no `onmessage` handler ever sees — was invisible to every
unit test on both sides of the wire, because it lived in the seam between them.
A component test would not have caught it either. A browser did.

The graph rules this app depends on are covered too: 37 tests in
`@repo/workflow`, the same module the UI runs for validation and the connection
guard.

So what's left uncovered is the middle layer: React components in isolation.

## What `@repo/e2e` pins down

- The stream is alive — a node is observed _running_ before it is observed
  _succeeded_, which the `POST /api/runs` snapshot alone cannot fake.
- Independent branches run at the same time.
- A failure marks one step `failed` and its descendants `skipped`, with the
  wording that distinguishes them.
- Cancel stops the in-flight step and retires the queued ones; nothing is left
  `queued` after a run settles.
- A reload re-attaches to a run in flight, and a run that finished while the tab
  was away is restored from its snapshot without re-announcing itself.
- Errors block Run; warnings don't.

## What I'd still write, in order

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

**3. The reconnect path, forced.** Kill the API mid-run, bring it back, assert
the canvas converges to the correct final state. `@repo/e2e` covers reload
recovery, but not the case where the socket dies under a page that stays open,
so `EventSource`'s own retry is still verified by hand.

## Why end to end first

Component tests and browser tests are not interchangeable, and if only one gets
written, this app's risk sits in the browser. Nothing in the React layer here is
algorithmically interesting — the rules live in `@repo/workflow` and the
execution lives in `@repo/api`, both well covered. What is interesting is
whether the pieces talk to each other: the stream, the proxy, storage, the page
lifecycle. Those only exist when the whole thing is running, and they are
exactly where this build's real bugs turned up.

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
