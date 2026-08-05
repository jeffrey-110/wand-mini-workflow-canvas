# Testing

```bash
pnpm run verify    # the gate: format check → typecheck → tests → build
pnpm run test      # 84 tests, ~2s
```

The brief says tests "beyond what you'd naturally write for tricky logic" aren't
evaluated. So the suite is aimed squarely at the parts that are genuinely tricky
or have an invisible failure mode, and skips the parts where a test would only
restate the code.

## What's covered

| Suite                         | Tests | What it pins down                                                              |
| ----------------------------- | ----- | ------------------------------------------------------------------------------ |
| `workflow/validation.test.ts` | 20    | Every rule, both severities, and `canConnect` agreeing with `validateWorkflow` |
| `workflow/topology.test.ts`   | 9     | Cycle detection, reachability, duplicate-edge collapsing                       |
| `workflow/parse.test.ts`      | 8     | The trust boundary: what a bad payload does                                    |
| `api/runs/scheduler.test.ts`  | 12    | Concurrency, per-branch failure, cancellation                                  |
| `api/runs/store.test.ts`      | 10    | The event log's invariants and the resume backlog                              |
| `api/app.test.ts`             | 25    | The real HTTP surface, including the SSE stream                                |

### Why these and not others

**Graph rules.** A validator that is subtly too permissive doesn't fail loudly —
it shows up much later as a deadlocked run. There's also a specific invariant
worth pinning: anything `canConnect` permits must still pass
`validateWorkflow`, since one is a fast per-edge check and the other is the
whole-graph authority. That's a test.

**The scheduler.** Concurrency, failure isolation and cancellation are the three
things I'd otherwise only be able to confirm by staring at the canvas and hoping
the 10% dice landed the right way. `failNodeIds` (a store-level option
deliberately _not_ reachable over HTTP) makes failure deterministic — without
it these tests would be flaky by construction, which is the one thing worse than
no test.

Concurrency is asserted on wall-clock: a diamond of four 200ms steps must
finish in ~600ms (three levels) and not ~800ms (serialised). It's a timing
assertion with generous bounds, which is a deliberate trade — the alternative is
injecting a clock, and that would mean testing a fake scheduler.

**The event log.** Reconnection is the feature most likely to break silently, so
the log's invariants are asserted directly: sequence numbers are monotonic _and
gap-free_, the log always ends with `run.finished`, a cursor replays only the
tail, a cursor ahead of the log falls back to a snapshot, and the
subscribe-then-drain seam produces no gap.

**The HTTP surface.** These replaced a set of unit tests for a hand-rolled
router when the API moved to Express. Mounting the real app via `supertest`
costs the same to write and covers the thing that can actually break — the
contract — rather than the dispatch.

One of them is a regression test with a story: **`emits no event: line, so a
plain onmessage handler receives everything`**. Writing `event: node.updated` on
an SSE frame makes `EventSource` dispatch a _typed_ event, delivered only to
`addEventListener('node.updated', …)` and never to `onmessage`. The stream looks
flawless in curl and delivers nothing to the browser. It cost real debugging
time, and it's the kind of bug that comes back.

## What isn't covered, and what I'd add

- **No component tests.** Nothing in `apps/web` is tested. The two I'd write
  first: the inspector's write-through editing (no draft state, no Save — so a
  keystroke must be observable in `graph.store` immediately), and that a
  `node.updated` event re-renders exactly one node card, since that's the
  performance claim the whole state split rests on.
- **No end-to-end test.** One Playwright path — load the example, run it, assert
  every node reaches a terminal state — would cover the wiring that unit tests
  structurally can't, including the SSE bug above.
- **`server.ts` is excluded from coverage.** It's the composition root: it binds
  a port and wires modules that are each covered directly. A test there would
  only assert that the wiring is the wiring.
- **No load testing.** The 500-node claims in the README are reasoned from the
  subscription model, not measured. I'd want a real profile before defending a
  specific number.
- **The reconnect path is tested at the log level, not the browser level.** The
  server side (cursor → backlog) is well covered; `EventSource`'s own retry
  behaviour is exercised by hand, not automatically.

## Conventions

- Unit tests live beside the code they cover, as `*.test.ts`.
- Fixtures come from `@repo/factories` — named topologies (`diamondWorkflow`,
  `twoChainWorkflow`, `cyclicWorkflow`) with overridable configs, so a test
  names only the thing it is about.
- `LOG_LEVEL=silent` in `apps/api/vitest.config.ts`: 25 HTTP tests each logging
  a request line buries the report.
- No mocking of the modules under test. The scheduler tests run the real
  scheduler against the real store; only the dice are pinned.
