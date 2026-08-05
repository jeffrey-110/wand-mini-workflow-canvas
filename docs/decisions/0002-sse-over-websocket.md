# 0002 — Stream with SSE, not WebSocket

## Context

Run progress has to reach the canvas live. The brief names SSE, WebSocket and
streamed `fetch` as options and asks for the choice to be justified.

The traffic is asymmetric in a way that decides most of this: the server emits
a few dozen events over a few seconds; the client emits **nothing**. Creating
and cancelling a run are discrete commands that want a status code and an error
body, which is what HTTP already is.

The other force is reconnection. The brief calls out "the browser tab reconnects
mid-run" as a case to handle, so whatever transport is chosen has to answer it.

## Decision

Server-Sent Events for the stream. Commands stay ordinary POSTs.

Each run keeps an append-only event log with a monotonic `seq`, and every frame
is written with that `seq` as its `id:`:

```
id: 7
data: {"seq":7,"type":"node.updated","state":{…}}
```

`EventSource` reconnects on its own and resends the last id it saw as
`Last-Event-ID`. So the cursor the browser volunteers _is already_ the cursor the
log is indexed by, and resume is:

```ts
run.events.filter((event) => event.seq > afterSeq);
```

The reconnection story therefore costs one filter and one header read, not a
subsystem.

## Consequences

- Reconnect, retry interval and backoff are the browser's job. The client code
  that deals with a dropped connection is one `onerror` handler that sets a
  status string for the UI.
- It's plain HTTP: same-origin through the Vite dev proxy, no second protocol to
  route, no separate auth path, and `curl -N` is a complete debugging tool.
- One transport, one direction, one place where events are numbered. The client
  can treat the stream as a log it folds, which is what lets it never infer
  state locally.
- **Cost: no client→server channel.** If the UI ever needs to send high-frequency
  data — live cursors for multiplayer, say — SSE can't carry it and this becomes
  the wrong choice. That's the trigger to revisit, and it's a real one for a
  collaborative builder.
- **Cost: connection count.** Browsers cap concurrent HTTP/1.1 connections per
  origin at ~6, so many simultaneous streams in one tab would starve. Not a
  concern for one run at a time, and HTTP/2 removes it.
- A proxy that buffers responses breaks it silently. Mitigated with
  `x-accel-buffering: no` and `no-transform`, and called out in the deploy notes.

## Alternatives rejected

**WebSocket.** The obvious default, and genuinely better if the channel were
bidirectional. Here it would mean hand-writing reconnect, heartbeat, backoff and
a resume handshake — reimplementing what `EventSource` gives away — to gain a
client→server direction that nothing uses. It also can't be inspected with curl,
which mattered more than expected while debugging.

**Streamed `fetch` + `ReadableStream`.** Full control over framing and headers,
and it works with POST (so the workflow could go in the body and skip the
create/subscribe split). Rejected because reconnection becomes entirely mine to
write, which is precisely the part SSE was chosen for. Worth revisiting if the
run payload ever needs to be sent on the streaming request itself.

**Polling `GET /api/runs/:id`.** Simplest possible thing, and the snapshot
endpoint exists anyway for reload recovery. Rejected for the UX: sub-second
polling to make a canvas feel alive is wasteful, and anything slower makes
concurrent steps look sequential — which would hide the one behaviour the
visualisation exists to show.

## Note

The `id:` field is load-bearing and the `event:` field is actively harmful here.
Writing `event: node.updated` makes `EventSource` dispatch a _typed_ event that
only reaches `addEventListener('node.updated', …)`, never `onmessage` — a stream
that looks perfect in curl and delivers nothing to the browser. The discriminant
lives in the JSON payload instead. See
[0007](./0007-event-log-resume.md) and the regression test in `apps/api/src/app.test.ts`.
