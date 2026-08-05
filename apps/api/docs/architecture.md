# `@repo/api` — internals

## Layering

```
server.ts        process lifecycle only — binds the port, handles signals
  app.ts         assembles Express; reading it top-to-bottom is request order
    http/        transport concerns, no domain knowledge
      errors.ts        HttpError + the one place anything thrown becomes one
      sse.ts           SSE framing and the resume cursor
      params.ts        narrows Express 5's string | string[] path params
      request-context.ts   requestId, attached before everything
      middleware/      error handler, request log, security headers
    routes/        adapts HTTP to the domain; no execution logic
    runs/          the domain — knows nothing about HTTP
      store.ts         run registry + event log + subscribers
      scheduler.ts     the DAG executor
```

The rule that keeps this honest: **`runs/` has no HTTP imports.** The scheduler
doesn't know what a 422 is; the store doesn't know what a response is. That's
what lets `scheduler.test.ts` drive real executions with no server involved.

## The middleware chain

```
context → security headers → CORS → log → json body → /api router → 404 → errors
```

Two orderings are load-bearing:

**Context first**, so the error handler always has a `requestId` to log and to
put in the response — even for a request that failed before reaching a route.

**Errors last.** Express 5 forwards a rejected promise from an `async` handler
here automatically, which is the main reason the app is on 5 rather than 4: no
`asyncHandler` wrapper on every route, and no route that hangs forever because
someone forgot one.

The error handler's `headersSent` guard is what makes it safe around the SSE
route. Once a stream has started there's no status code left to change, so the
only correct move is to log and destroy the socket — writing an error body into
a half-delivered event stream would corrupt the client's parse.

## The scheduler

```ts
launchEligible();
while (inFlight.size > 0) {
  await Promise.race(inFlight); // wake on the FIRST completion
  launchEligible();
}
```

A node is eligible when its outstanding-dependency count hits zero. Waking on
`Promise.race` rather than `Promise.all` is the difference between "a node starts
the instant its last dependency lands" and "a node starts when its whole level
finishes" — the latter would make a fast branch wait on a slow sibling for no
reason.

Three details that are easy to get wrong and are each covered by a test:

- **`launchEligible` iterates a snapshot** (`[...pending]`). `runNode` mutates
  `pending` synchronously before its first `await`, so iterating the live map
  would skip entries.
- **`buildAdjacency` uses sets.** A duplicate edge — which validation permits as
  a warning — would otherwise double a node's dependency count and deadlock it.
- **`settle()` retires the whole downstream subtree** when a node doesn't
  succeed, rather than leaving those nodes `queued` forever.

`isAbort` checks two shapes because `timers/promises` rejects with an
`AbortError` carrying the abort reason as `cause`, not with the reason itself.

## The store

`seq` is assigned in exactly one place — `emit` — which is what guarantees it's
monotonic and gap-free. Everything the UI can see goes through `updateNode` or
`setStatus`, both of which emit, so there is no way to change observable state
without recording it.

`subscribe` returns a backlog _and_ registers the subscriber in one synchronous
block. That's the seam where an event could otherwise slip between "read the
history" and "start listening" and leave a permanent gap.

A subscriber that throws is dropped rather than allowed to stall the run — its
client will reconnect and replay from its cursor anyway.

Retention: a TTL sweeper plus a hard cap. **In-flight runs are never evicted**,
because dropping one would orphan a client that's watching it.

## Why it's shaped for durability

Persistence is out of scope, but the interface is the one a Redis- or
Postgres-backed store would expose (`create` / `get` / `emit` / `subscribe`), so
swapping the implementation is a single-file change. `emit` becoming
"append to durable storage, then fan out" is the outbox pattern with no caller
changes — which is the point of writing it this way now.

## Type stripping constraints

`pnpm dev` runs `node --watch --experimental-strip-types`, which _erases_ types
rather than compiling them. Anything that emits code is rejected outright, so the
codebase avoids:

- constructor parameter properties (`constructor(readonly x: T)`) — fields are
  declared in the class body and assigned in the constructor instead
- `enum` — `as const` arrays with a derived union type
- `namespace` — except the `declare global { namespace Express }` merge, which
  is types-only and therefore erasable

`pnpm build` uses Vite to bundle to `dist/server.js`, so `pnpm start` runs plain
JavaScript with no flags. The `@repo/*` packages are consumed as source, so they
have to be inlined; Node builtins stay external.
