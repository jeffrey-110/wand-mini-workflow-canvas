# Architecture decision records

Short records of decisions where the **rejected** option was reasonable. If a
choice was obvious, it isn't here.

Records live with the workspace they constrain; the ones in this directory are
the system-level remainder. Numbering is repo-wide and chronological regardless
of location — a record keeps its number if it moves.

## System-level

| #                                      | Decision                                                      |
| -------------------------------------- | ------------------------------------------------------------- |
| [0002](./0002-sse-over-websocket.md)   | Stream with SSE, not WebSocket                                |
| [0005](./0005-four-workspaces.md)      | Split into four workspaces with Turborepo                     |
| [0007](./0007-event-log-resume.md)     | Keep a per-run event log; never infer run state on the client |
| [0008](./0008-hand-written-parsing.md) | Hand-write payload parsing instead of using a schema library  |

`0002` and `0007` are a pair — the transport choice and the state model that
depends on it — which is why both are here rather than under `apps/api`.

## `@repo/api`

| #                                                                | Decision                       |
| ---------------------------------------------------------------- | ------------------------------ |
| [0001](../../apps/api/docs/decisions/0001-express.md)            | Express for the BFF            |
| [0006](../../apps/api/docs/decisions/0006-per-branch-failure.md) | Fail per-branch, not fail-fast |

## `@repo/web`

| #                                                        | Decision                                        |
| -------------------------------------------------------- | ----------------------------------------------- |
| [0003](../../apps/web/docs/decisions/0003-react-flow.md) | Use React Flow, and let it own only interaction |
| [0004](../../apps/web/docs/decisions/0004-two-stores.md) | Two stores split by lifetime, not by feature    |

Format: context → decision → consequences (including what it costs) →
alternatives rejected.

## Adding one

Put it under the workspace it constrains — `apps/<app>/docs/decisions/` — or here
if it spans more than one. Take the next number in the repo-wide sequence and add
it to the right table above.
