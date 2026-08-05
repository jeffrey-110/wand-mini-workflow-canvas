# 0006 — Fail per-branch, not fail-fast

## Context

Nodes fail (~10% each, per the brief). When one does, the scheduler has to
decide what happens to everything else: the node's descendants, and the
unrelated branches that are still mid-flight.

The brief calls this out directly — "a node fails while others are still
running" — so it's a decision, not an implementation detail.

## Decision

Three different outcomes, for three genuinely different situations:

| Situation                                | Outcome            |
| ---------------------------------------- | ------------------ |
| The node that failed                     | `failed`           |
| Everything transitively downstream of it | `skipped`          |
| Everything else in flight                | runs to completion |

The run's terminal status is `failed` if anything failed, `canceled` if the user
cancelled, otherwise `succeeded`.

`skipped` carries `skippedBecauseOf: <nodeId>`, and it is visually distinct from
`failed` on the canvas — different glyph, different colour, dashed border. That
distinction is the whole point: **one step broke; these were collateral.** A
canvas showing five red nodes when one thing went wrong is actively misleading
about where to look.

## Consequences

- You learn everything that was broken in a single run, instead of fixing one
  node, re-running, and discovering the next one. For a builder people iterate
  in, that's the difference between one cycle and five.
- The failure blast radius is legible at a glance: red is the cause, amber is
  the consequence.
- Descendants are retired _immediately_ when their ancestor fails, rather than
  being left `queued` forever. A permanently-queued node is the kind of thing
  that reads as a hung run.
- **Cost: wasted work.** A node whose only consumer has already been skipped
  still runs to completion — visible as a step that finishes with nowhere for
  its result to go. Correct but wasteful; cancelling in-flight work whose entire
  downstream is retired would be a genuine improvement and is listed as a known
  limitation.
- **Cost: the run takes as long as its slowest healthy branch**, even when the
  result is already doomed. That's the deliberate trade — information over speed.

## Alternatives rejected

**Fail-fast: abort the whole run on the first failure.** Simplest, and correct
for a deployment pipeline where later steps have side effects that a partial run
would leave inconsistent. Rejected because nothing here has side effects, and it
costs the user information they need: they'd fix one node at a time without
knowing three others were also broken.

**Mark descendants `failed` too.** Fewer states to explain. Rejected because it
loses the cause/consequence distinction, which is exactly what someone staring
at a failed run needs to see first.

**Continue past the failure with an empty input.** Keeps the graph flowing and
produces an end-to-end result. Rejected as dishonest — a downstream step
"succeeding" on input that never existed reports success for work that didn't
happen, which is worse than an obvious skip.

## Note

Cancellation deliberately uses `canceled` rather than `skipped` for retired
descendants, even though the mechanism is shared. A user who cancelled knows why
everything stopped; attributing it to an upstream failure would be wrong.
