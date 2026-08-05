# Operations

## Running it

```bash
pnpm run setup     # install; checks Node >= 22.6
pnpm run dev       # both sides
pnpm run dev:api   # API only, :8787
pnpm run dev:web   # UI only, :5173 (proxies /api to :8787)
```

`apps/api` runs its TypeScript directly under `node --watch
--experimental-strip-types`, so there is no build step in development. That's
also why the code avoids constructor parameter properties, enums and
namespaces — type stripping erases types, it doesn't compile them, so anything
that _emits_ code is rejected outright.

For a production-shaped run:

```bash
pnpm run build     # apps/web → dist/, apps/api → dist/server.js
pnpm run start     # node dist/server.js — plain JS, no flags
```

The API bundles to a single file because the `@repo/*` packages are consumed as
source and have to be inlined; Node builtins stay external.

## Configuration

Everything has a working default — there is no `.env` to create. All values are
validated at boot, so a bad one stops the process rather than surfacing as a
broken run an hour later.

| Variable              | Default                 | Notes                                               |
| --------------------- | ----------------------- | --------------------------------------------------- |
| `PORT`                | `8787`                  |                                                     |
| `HOST`                | `127.0.0.1`             | Local-only by default                               |
| `LOG_LEVEL`           | `info`                  | `debug` · `info` · `warn` · `error` · `silent`      |
| `CORS_ORIGINS`        | _(empty)_               | Comma-separated allowlist; empty = same-origin only |
| `MAX_BODY_BYTES`      | `2097152`               | A 1000-node graph fits comfortably                  |
| `RUN_FAILURE_RATE`    | `0.1`                   | The brief's 10%; per-request override wins          |
| `RUN_MIN_DURATION_MS` | `500`                   | The brief's 0.5–3s window                           |
| `RUN_MAX_DURATION_MS` | `3000`                  | Must be ≥ the min, or boot fails                    |
| `RUN_TTL_MS`          | `900000`                | How long a finished run stays readable              |
| `MAX_RUNS`            | `50`                    | Retention cap; in-flight runs are never evicted     |
| `SHUTDOWN_GRACE_MS`   | `5000`                  | Then force-exit                                     |
| `API_TARGET`          | `http://127.0.0.1:8787` | Vite dev-proxy target (web only)                    |

Handy for a demo:

```bash
RUN_MIN_DURATION_MS=6000 RUN_MAX_DURATION_MS=9000 pnpm run dev
```

Long steps give you a comfortable window to hit **Cancel run** and watch the
in-flight step abort while queued steps are retired.

## Observability

One JSON object per line on stdout; warnings and errors go to stderr, so
`pnpm run dev 2>errors.log` works.

```json
{"level":"info","time":"…","message":"request","requestId":"…","method":"GET","path":"/api/runs/…/events","status":200,"ms":51}
{"level":"info","time":"…","message":"run accepted","runId":"…","requestId":"…","nodes":5,"edges":5}
```

`requestId` correlates a server log line with the `x-request-id` header and the
`requestId` in any error body — which is what a user quotes in a bug report. A
client may supply its own via `x-client-request-id`, and that's what makes a
request traceable even when it timed out before a response came back.

`runId` is on every run-lifecycle line, so following one run through a log with
several interleaved is a grep.

Requests are logged on the response **finishing**, not when the handler returns.
That matters for SSE: timing at handler return would report a multi-minute
stream as a 0ms request and miss the status entirely.

## Runbook

**The UI says "Reconnecting…" and stays there.** The API is down or restarting.
`EventSource` retries every 1.5s on its own; when the API comes back the client
resumes from its cursor. If the run expired in the meantime the cursor is
dropped rather than showing a ghost run. Check `curl localhost:8787/api/health`.

**"Could not reach the workflow service."** The POST didn't reach the API at
all — distinct copy from a server-side rejection on purpose. Usually
`pnpm run dev:api` isn't running, or the Vite proxy is pointed elsewhere via
`API_TARGET`.

**A run is stuck with steps queued forever.** Would mean the scheduler's
dependency counting is wrong; `GET /api/runs/:id` shows the truth. The known
cause of this class of bug — a duplicate edge double-counting a dependency — is
handled (`buildAdjacency` uses sets) and tested.

**Memory grows over a long session.** Runs are retained until `RUN_TTL_MS` after
they finish, capped at `MAX_RUNS`. Runs still in flight are never evicted, since
dropping one would orphan its client. Lower `MAX_RUNS` if it matters.

**Port already in use.** The web dev server uses `strictPort`, so it fails
loudly rather than silently moving to 5174 — a shifted port would break the
proxy assumption and be easy to miss.

## Deploying

Not set up, and out of scope per the brief. What it would need:

- `HOST=0.0.0.0` and a real `PORT`.
- `CORS_ORIGINS` set if the UI is served from another origin; otherwise serve
  `apps/web/dist` as static files from the same origin and skip CORS entirely.
- **A proxy that doesn't buffer.** The SSE route sets `x-accel-buffering: no`
  and `cache-control: no-transform` for exactly this, but any intermediary that
  buffers or compresses the response will hold every event until the run ends.
- One process only. Two instances behind a load balancer would not see each
  other's runs — that's the durable-execution work described in
  [architecture.md](./architecture.md#scaling-notes).
