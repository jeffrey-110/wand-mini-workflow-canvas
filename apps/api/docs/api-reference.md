# API reference

Base path `/api`. JSON in, JSON out, except the event stream.

Every response carries `x-request-id`. Send your own as `x-client-request-id`
and it will be echoed — that's what makes a request traceable even when it timed
out before a response came back.

---

## `GET /api/health`

```json
{ "ok": true, "activeRuns": 0 }
```

---

## `POST /api/workflows/validate`

Validate a graph without running it. Accepts either `{ "workflow": {…} }` or a
bare workflow — the former matches the create-run body, the latter is what
anyone reaching for curl types.

**200** — note that `200` means "I checked it", not "it's valid":

```json
{
  "valid": false,
  "issues": [
    {
      "code": "CYCLE",
      "severity": "error",
      "message": "Cycle detected: A → B → A. Workflows must be acyclic.",
      "nodeIds": ["a", "b", "a"]
    }
  ]
}
```

The editor doesn't call this per keystroke — it runs `@repo/workflow` locally,
which is the same code. This exists for clients that can't, and for an explicit
check without starting a run.

---

## `POST /api/runs`

```jsonc
{
  "workflow": { "version": 1, "name": "…", "nodes": [...], "edges": [...] },
  "options": {              // all optional
    "failureRate": 0.1,     // 0–1
    "minDurationMs": 500,
    "maxDurationMs": 3000
  }
}
```

**201** — with `Location: /api/runs/:runId`:

```json
{
  "runId": "0a99e6dd-…",
  "snapshot": {
    "runId": "0a99e6dd-…",
    "status": "running",
    "startedAt": 1785965328444,
    "nodes": { "in": { "nodeId": "in", "status": "running", "startedAt": … } },
    "lastSeq": 2
  }
}
```

The response reports that the run was **accepted**, not that it succeeded —
execution isn't awaited. The snapshot lets the canvas paint before the stream
opens. It often already shows the first node `running`, because the scheduler
starts synchronously before its first `await`.

| Status | Code                | When                                          |
| ------ | ------------------- | --------------------------------------------- |
| 400    | `malformed_request` | Not a workflow. Message names the exact path. |
| 413    | `body_too_large`    | Over `MAX_BODY_BYTES`.                        |
| 422    | `invalid_workflow`  | Parsed, but not runnable. Carries `issues[]`. |

---

## `GET /api/runs/:runId`

Point-in-time snapshot, same shape as above. This is what reload recovery reads
first: it says whether the run is still going before the client decides whether
to reconnect.

**404 `run_not_found`** — unknown or expired.

---

## `GET /api/runs/:runId/events`

`text/event-stream`. The stream of record.

```
retry: 1500

id: 3
data: {"seq":3,"at":1785965330058,"type":"node.updated","state":{"nodeId":"in","status":"succeeded","output":"hello","finishedAt":…}}

: ping
```

**Resuming.** Send `Last-Event-ID: <seq>` (which `EventSource` does automatically
on reconnect) or `?lastEventId=<seq>` for a manual re-attach after a page reload
— `EventSource` has no API for setting a header on a fresh connection.

- With a usable cursor: only events after it are replayed.
- Without one, or with a cursor ahead of the log: a single `run.snapshot` event
  instead, so a client that's been away converges in one message.

**Event types**, all carrying `seq` and `at`:

| `type`         | Payload                                     |
| -------------- | ------------------------------------------- |
| `run.snapshot` | `snapshot` — full state, for a fresh client |
| `run.started`  | `runId`, `nodeIds`                          |
| `node.updated` | `state` — one `NodeRunState`                |
| `run.finished` | `runId`, `status`, `finishedAt`             |

Node statuses: `queued` → `running` → `succeeded` \| `failed` \| `skipped` \|
`canceled`.

The server closes ~50ms after `run.finished`; the client closes on that event
too. Closing from both ends is what stops `EventSource` redialling a finished
run forever.

**There is deliberately no `event:` line.** Writing one makes `EventSource`
dispatch a typed event that only reaches `addEventListener(type, …)` and never
`onmessage` — a stream that looks perfect in curl and delivers nothing to the
browser. The discriminant is `type` in the payload.

A `: ping` comment every 15s keeps intermediaries from reaping an idle
connection.

---

## `POST /api/runs/:runId/cancel`

**202** — accepted, not completed:

```json
{ "runId": "0a99e6dd-…", "status": "canceling" }
```

Which nodes actually stopped is decided by the scheduler and reported on the
stream. In-flight nodes abort within a tick; queued nodes are retired in the
same pass; already-succeeded steps keep their results.

**409 `run_already_finished`** — it finished first. That's a race a client can
legitimately lose, and the UI treats it as a non-event rather than an error.

---

## Errors

One envelope everywhere:

```json
{
  "error": "This workflow has 1 error that must be fixed before it can run.",
  "code": "invalid_workflow",
  "requestId": "f7e6e2b0-…",
  "issues": [ … ]
}
```

`issues` appears only on `invalid_workflow`. `code` is stable and
machine-readable; `error` is safe to show a user.

| Code                   | Status |
| ---------------------- | ------ |
| `malformed_request`    | 400    |
| `body_too_large`       | 413    |
| `invalid_workflow`     | 422    |
| `run_not_found`        | 404    |
| `run_already_finished` | 409    |
| `not_found`            | 404    |
| `internal_error`       | 500    |

---

## Trying it

```bash
WF='{"workflow":{"version":1,"name":"t","nodes":[
  {"id":"in","kind":"input","position":{"x":0,"y":0},"config":{"label":"Seed","value":"Wand Studio"}},
  {"id":"out","kind":"output","position":{"x":0,"y":0},"config":{"label":"Sink","destination":"console"}}],
  "edges":[{"id":"e","source":"in","target":"out"}]},
  "options":{"failureRate":0,"minDurationMs":800,"maxDurationMs":1200}}'

RID=$(curl -s -X POST localhost:8787/api/runs -H 'content-type: application/json' -d "$WF" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["runId"])')

curl -N "localhost:8787/api/runs/$RID/events"
```
