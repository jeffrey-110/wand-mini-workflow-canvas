# 0005 — Split into four workspaces with Turborepo

## Context

This is one Node server, one React client, and a handful of shared types. For
that size a monorepo is hard to justify on its own merits: workspaces add
package boundaries, a lockfile layer and per-package configs to solve
coordination problems that two directories and one `tsconfig` don't have.

The decision was made to proceed anyway, for consistency with the existing house
layout. That means the boundaries have to earn their keep.

## Decision

Four pnpm workspaces (plus two that exist only for tests) orchestrated by
Turborepo:

```
apps/api   apps/web   apps/e2e
packages/types   packages/workflow   packages/factories
```

Since the structure is going to exist, the boundaries were drawn as **dependency
rules** that do real work:

- `@repo/types` depends on **nothing** → the wire contract can't import an
  implementation.
- `@repo/workflow` depends on types only, with `lib: ["ES2023"]` and no `types`
  in its tsconfig → no I/O, no DOM, no `node:` imports are even _expressible_.
  That is what makes it safe to run the same validator in the browser and on the
  server, which is the single highest-value thing this split buys.
- `@repo/factories` depends on types only → a fixture can't drift toward one
  app's internals and quietly become a second implementation.
- `apps/web`'s tsconfig has no `node` types; `apps/api`'s does → a stray
  `node:fs` in browser code is a compile error, not a bundle surprise.
- `@repo/e2e` depends on **nothing in this repo** → an end-to-end test can only
  reach the system the way a user does, over HTTP. It is a separate workspace
  rather than a folder in `apps/web` precisely so that this rule is enforced by
  the package boundary instead of by discipline.

## Consequences

- The validator genuinely is one implementation. The client's instant feedback
  and the server's authoritative check cannot disagree, because they're the same
  function — that's a correctness property, not a convenience.
- A change to the wire format is a compile error in the other app.
  `pnpm run typecheck` at the root is the check.
- No build step between packages: everything is consumed as TypeScript source,
  because both consumers already run TS-aware tooling.
- **Cost paid honestly:** several rounds of deciding what belongs where, which
  produced no user-visible improvement. The split of `parse` (400) from
  `validate` (422) into one package, and the `catalog`/`topology`/`validation`
  file boundaries inside it, were re-cut twice.
- Turborepo's caching is worth close to nothing at this size — the value is the
  task graph (`typecheck` and `test` depending on `^build`), not the cache.

## Alternatives rejected

**Two directories, one `package.json`.** Adequate for the actual size, and what
I'd recommend for a project that stays this size. Rejected because the shared
validator would then live in a `shared/` folder with nothing stopping it from
importing `node:crypto` or `document` — the compile-time guarantee above is the
thing that would be lost, and it's the one that matters most here.

**One `packages/shared`.** Simpler, one fewer package. Rejected on the same
reasoning as the name: `shared` is the kind of name that accumulates unrelated
code. Splitting `types` (no deps, no logic) from `workflow` (logic, one dep) is
what keeps the "contract imports nothing" rule checkable rather than aspirational.
