# @repo/web

The canvas editor: compose a workflow, run it, watch it stream.

```bash
pnpm --filter @repo/web dev         # vite on :5173, proxies /api to :8787
pnpm --filter @repo/web build       # → dist/
pnpm --filter @repo/web typecheck   # two projects: browser + vite config
```

`pnpm run dev` at the root starts this alongside the API. On its own, this dev
server proxies `/api` to `http://127.0.0.1:8787` (override with `API_TARGET`),
so the API must be running separately. There's no `.env` — `API_TARGET` is a
dev-server concern, read directly in `vite.config.ts`.

| Doc                               | What's in it                                             |
| --------------------------------- | -------------------------------------------------------- |
| [frontend.md](./docs/frontend.md) | The boundary rule, state, the network edge, UX decisions |
| [testing.md](./docs/testing.md)   | What isn't covered, and what I'd write first             |
| [decisions/](./docs/decisions/)   | React Flow; two stores split by lifetime                 |

## Before editing

**The rule:** a file that imports `@repo/types` or `@repo/workflow` belongs in
`containers/`. It's phrased that way so it can be checked:

```bash
grep -rn "@repo/types\|@repo/workflow" src/components/    # must return nothing
```

Everything in `components/` therefore renders in isolation — no provider, no
network stub, no domain types.

**No `node` types in this project's tsconfig.** Importing `node:fs` or touching
`process` in `src/` is a compile error, because this code ships to browsers. The
Vite config needs them, so it typechecks separately via `tsconfig.node.json`.

**Run state never goes in `graph.store`.** It reads naturally to put a node's
status on the node object, and it would make every event re-render the whole
canvas. [decisions/0004](./docs/decisions/0004-two-stores.md) has the full
reasoning; `docs/testing.md` has the test that should exist to enforce it.
