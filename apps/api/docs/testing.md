# `@repo/api` — tests

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/api test:coverage
```

47 tests across three files. See [the repo-wide testing doc](../../../docs/testing.md)
for the overall strategy; this covers what's specific to the API.

| File                     | Tests | Focus                                         |
| ------------------------ | ----- | --------------------------------------------- |
| `runs/scheduler.test.ts` | 12    | Concurrency, per-branch failure, cancellation |
| `runs/store.test.ts`     | 10    | Event-log invariants and the resume backlog   |
| `app.test.ts`            | 25    | The real HTTP surface, through `supertest`    |

## Making failure deterministic

The scheduler fails nodes on a coin flip, which would make every failure test
flaky by construction. `ResolvedRunOptions.failNodeIds` short-circuits the dice:

```ts
const { statuses } = await run(diamondWorkflow(), { failNodeIds: ['a'] });
expect(statuses).toEqual({
  in: 'succeeded',
  a: 'failed',
  b: 'succeeded',
  out: 'skipped',
});
```

It lives on the _store's_ options and is deliberately **not** readable from the
HTTP request body — `resolveOptions` in `routes/runs.ts` ignores it. Accepting it
over the wire would make "simulated" behaviour scriptable from the browser,
which is a different thing from a test hook.

## Timing assertions

Concurrency is asserted on wall-clock, with generous bounds:

```ts
// Three sequential levels x 200ms. Serialising a and b would make it 800ms+.
expect(elapsed).toBeGreaterThanOrEqual(560);
expect(elapsed).toBeLessThan(760);
```

A deliberate trade. The alternative — injecting a clock — would mean the test
exercises a fake scheduler rather than the real one, and the property under test
_is_ real concurrency. A second test asserts the same thing structurally, by
checking that two sibling nodes' start/finish intervals overlap, so a machine
under heavy load fails one assertion rather than both.

## App-level tests

These replaced 10 unit tests for a hand-rolled router when the API moved to
Express (see [decision 0001](./decisions/0001-express.md)). Mounting the real
app costs the same to write and covers the contract rather than the dispatch:
status codes, the error envelope, `x-request-id` echo, and the SSE stream parsed
back into events.

`createApp(store)` takes the store as an argument rather than importing a module
singleton, so each test gets a fresh one with no global state to reset.

Two of them exist because of a bug that reached the browser:

- **`emits no event: line, so a plain onmessage handler receives everything`** —
  an `event: node.updated` line makes `EventSource` dispatch a typed event that
  never reaches `onmessage`. curl showed a flawless stream; the browser received
  nothing.
- **`tags every frame with an id`** — without `id:` there is no `Last-Event-ID`,
  and resume silently degrades to a full snapshot every reconnect.

## Not covered

- `server.ts` — the composition root. Excluded from coverage: it binds a port
  and wires modules that are each covered directly.
- Graceful shutdown, the TTL sweeper's timer, and heartbeat frames. All
  time-based and would need a fake clock for little value.
- Backpressure on a slow SSE consumer. `res.write` return values are ignored;
  at this event volume it doesn't matter, but it's a real gap for a chattier stream.
