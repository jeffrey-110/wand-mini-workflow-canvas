# 0001 — Express for the BFF

## Context

The brief says "Express/Fastify/Nest — your call" and asks for the tradeoff to
be explainable. The API is six endpoints, one of which is a long-lived SSE
stream, over an in-memory run engine.

This was actually built twice. The first version was hand-rolled `node:http`
with a decorator-style middleware chain and a small route table, matching an
existing house pattern. It worked and was tested, but the reasoning behind it
didn't survive being challenged: the strongest argument offered for it was that
frameworks cause SSE buffering surprises, and that's not really true —
Fastify needs `reply.hijack()`, Express needs nothing at all. It was one line
either way, not a reason.

## Decision

Express 5, with the routing and layering kept explicit:

```
context → security headers → CORS → log → json body → /api router → 404 → errors
```

Reading `app.ts` top to bottom is the order a request passes through. Route
handlers throw `HttpError`; a single terminal error middleware converts anything
thrown into the one response envelope.

**Express 5 specifically**, because it forwards a rejected promise from an
`async` handler to the error middleware automatically. That removes the
`asyncHandler` wrapper from every route — and with it the class of bug where
someone forgets one and the request hangs forever with no log line.

## Consequences

- Zero explanation cost. It's on the brief's own list, and every reviewer knows
  what `app.get('/api/runs/:runId/events', handler)` does.
- ~250 lines deleted versus the hand-rolled version: the router, body reading
  with a size cap, the CORS middleware, and the `compose` helper all became
  `express`, `express.json({ limit })` and `cors`.
- SSE needed no framework accommodation at all. `http/sse.ts` moved across
  unchanged: it writes to `res` directly and simply never calls `next()`, which
  is what keeps the response open.
- Dev still runs under `node --watch --experimental-strip-types` with no build
  step, which is the constraint that ruled out one of the alternatives entirely.
- **Cost: two behaviours regressed slightly.** A known path with the wrong method
  now returns `404` instead of `405` (Express's default; restoring it would mean
  a `router.all` catch per route, which isn't worth it). And oversized/malformed
  bodies are detected by `express.json` rather than while reading, so the
  translation to `413`/`400` happens in `toHttpError` by inspecting the body
  parser's `type` field — a slightly indirect coupling to a dependency's
  internals, and the place this would break on a major upgrade.
- **Cost: 10 router unit tests deleted.** Replaced by 25 HTTP-level tests through
  `supertest` against the real app, which cover the contract rather than the
  dispatch. Net improvement, but worth naming as a deliberate trade.

## Alternatives rejected

**NestJS.** The strongest structural option, and the right answer for a service
with many providers and a team that needs enforced module boundaries. Rejected
on a concrete, verifiable constraint rather than taste: Nest is built on
decorators, and **decorators are not erasable syntax**. That means `apps/api`
could no longer run under `node --experimental-strip-types` — it would need a
real compile step, `reflect-metadata`, and `experimentalDecorators` /
`emitDecoratorMetadata`, all of which contradict this repo's
`verbatimModuleSyntax` / `isolatedModules` / typecheck-only-tsc setup. Paying
that for six endpoints and one in-memory service is ceremony, not architecture.

**Fastify.** Faster, better TypeScript, schema validation built in, and it keeps
type stripping. Genuinely close. Rejected because its advantages don't cash out
here — throughput is irrelevant for a local simulation, and validation already
lives in `@repo/workflow` where the browser can share it, so Fastify's schema
support would be a second, redundant validation mechanism. SSE also needs
`reply.hijack()`, a small amount of framework-specific knowledge Express doesn't
ask for.

**Hand-rolled `node:http`** — what this replaced. Zero dependencies, and the
router was only 80 lines. Rejected because those 80 lines plus body limiting,
CORS and the 405/404 distinction are all code I'd own and have to justify, in
exchange for nothing a reviewer would value. It also reads as a red flag unless
the reasoning is right there in the README, which is a tax on every future
reader.
