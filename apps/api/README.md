# @repo/api

The BFF: validates workflows, executes them concurrently, and streams progress
over SSE.

```bash
pnpm --filter @repo/api dev         # :8787, node --watch --experimental-strip-types
pnpm --filter @repo/api build       # → dist/server.js (single bundled file)
pnpm --filter @repo/api start       # plain node, no flags
pnpm --filter @repo/api test        # 47 tests
pnpm --filter @repo/api typecheck   # two projects: server + vite/vitest configs
```

`pnpm run dev` at the root starts this alongside the UI. There's no `.env` —
every setting has a working default and is validated at boot. See
[configuration](../../docs/operations.md#configuration).

| Doc                                         | What's in it                                             |
| ------------------------------------------- | -------------------------------------------------------- |
| [architecture.md](./docs/architecture.md)   | Layering, the middleware chain, the scheduler, the store |
| [api-reference.md](./docs/api-reference.md) | Every endpoint, the event types, the error envelope      |
| [testing.md](./docs/testing.md)             | What's covered and how failure is made deterministic     |
| [decisions/](./docs/decisions/)             | Express; per-branch failure                              |

## Before editing

**The rule:** `src/runs/` must not import anything HTTP. It's phrased that way so
it can be checked:

```bash
grep -rn "express\|\.\./http" apps/api/src/runs/    # must return nothing
```

The scheduler and store are the domain. Routes adapt HTTP to them; that
direction is never reversed. It's what lets the execution tests run real
workflows with no server involved.

**Type stripping.** `pnpm dev` runs Node's `--experimental-strip-types`, which
erases types rather than compiling them. Constructor parameter properties,
`enum` and `namespace` all emit code and are rejected outright — see
[architecture.md](./docs/architecture.md#type-stripping-constraints) for what to
write instead. `pnpm typecheck` won't catch this; `pnpm dev` failing to start
will.

**Anything observable goes through the store.** `updateNode` and `setStatus`
both emit an event, so state the UI can see is always on the log. Mutating
`run.nodes` directly would produce a canvas that disagrees with a reconnecting
client, and nothing would catch it.
