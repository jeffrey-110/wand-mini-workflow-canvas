# `@repo/e2e`

End-to-end tests. A real browser, driving the real UI, against the real API,
over the real proxy.

```bash
pnpm --filter @repo/e2e test:e2e        # headed, which is the default
PLAYWRIGHT_HEADLESS=1 pnpm --filter @repo/e2e test:e2e
pnpm --filter @repo/e2e test:e2e:ui     # Playwright's UI mode
```

Nothing needs to be running first. The suite starts `@repo/api` on `8787` and
`@repo/web` on `5173` itself, and stops them when it's done.

## Why this exists

Because of one bug. The API wrote SSE frames like this:

```
id: 7
event: node.updated
data: {"seq":7,"type":"node.updated",...}
```

That is well-formed SSE. `curl -N` showed a flawless stream, every API test
passed, every scheduler test passed — and the browser received nothing, because
an `event:` line makes `EventSource` dispatch a _typed_ event that only reaches
`addEventListener('node.updated', ...)`, never `onmessage`. The client had a
single `onmessage` handler.

The defect was not in the server and not in the client. It was in the seam
between them, and no unit test on either side could have found it. That seam is
the whole justification for paying the cost of a browser in a test suite, and it
is what these tests are aimed at.

The sharpest expression of it is in `run.spec.ts`: the assertion that a node is
observed **running** before it is observed **succeeded**. A frozen canvas would
still satisfy a naive end-state assertion, because the `POST /api/runs` response
snapshot already shows the first node running. Only an intermediate state proves
the stream is alive.

## Its own workspace, depending on neither app

`@repo/e2e` imports nothing from `@repo/web`, `@repo/api` or `@repo/workflow`.
That is the point of it being a separate workspace rather than a folder inside
`apps/web`:

- A test that imported the constant the app renders from would assert that a
  value equals itself. Text is asserted as text, because that is what a user
  reads.
- A test that imported `@repo/workflow` would let validation expectations drift
  in lockstep with the rules they exist to pin down.
- The suite depends on the system's _observable behaviour_, so it keeps working
  across a refactor and fails when behaviour actually changes. That's the only
  kind of end-to-end test worth maintaining.

The one exception is deliberate: node ids from the seeded example graph
(`example-input`, `example-slug`, …) are hard-coded in `tests/canvas.ts`. They
are the fixture's contract, not an implementation detail.

## What's covered

| Spec                 | What it pins down                                                              |
| -------------------- | ------------------------------------------------------------------------------ |
| `run.spec.ts`        | The stream is live; branches run concurrently; outputs flow; editing locks     |
| `failure.spec.ts`    | `failed` vs `skipped`; the reason text; the counts; the graph unlocks after    |
| `cancel.spec.ts`     | In-flight steps stop, queued steps are retired, nothing is left `queued`       |
| `resume.spec.ts`     | Re-attach to a run in flight; restore one that finished while the tab was away |
| `validation.spec.ts` | Errors block Run, warnings don't                                               |

## Determinism

**Failure** comes from the 100% failure rate in the toolbar, not from luck.
`failNodeIds` — which would let a test nominate exactly which node fails — is
deliberately not accepted over HTTP, because a browser must not be able to
script which steps break. That leaves one scenario out of reach here: a failure
in one branch while an unrelated branch runs to completion. It's covered in
`apps/api/src/runs/scheduler.test.ts`, where forcing a specific node is legal.

**Timing** comes from `RUN_MIN_DURATION_MS` / `RUN_MAX_DURATION_MS`, set to
`400`/`700` in `playwright.config.ts`. Long enough that two sibling branches are
observably running at the same instant, short enough that the suite finishes in
about a minute.

**State** is cleared per test. `Canvas.open()` wipes `localStorage` (the graph)
and `sessionStorage` (the resume cursor) and reloads, so no test can inherit a
previous test's finished run and quietly assert against it.

## Headed by default

A run is a thing you watch, and a suite you can watch is a suite you can debug.
`PLAYWRIGHT_HEADLESS=1` switches it off for CI.

## Ports

`5173` and `8787`, the same ports as `pnpm dev`, and the suite refuses to move.
A test run on a different port isn't testing what you ship — and an earlier
version of this config, which reused whatever dev server happened to be on
`5173`, inherited one started from an older config with no `/api` proxy and
failed every test with a 404. So: fixed ports, always started by the suite,
never inherited. If a port is taken it fails loudly, which is the same call
`vite.config.ts` makes with `strictPort`.
