# Documentation

Docs live with the code they describe. This directory holds only what no single
workspace owns — the system view, the deployment story, and the decisions that
span more than one side.

Start with [architecture.md](./architecture.md): it explains how a workflow gets
from the canvas to a stream of live status, and why the pieces are split the way
they are.

## System-level

| Document                             | What's in it                                                     |
| ------------------------------------ | ---------------------------------------------------------------- |
| [architecture.md](./architecture.md) | Problem shape, workspace graph, request lifecycle, scaling notes |
| [operations.md](./operations.md)     | Running it, configuration, observability, runbook, deploy notes  |
| [testing.md](./testing.md)           | What each suite covers and — more usefully — what isn't covered  |
| [decisions/](./decisions/)           | ADRs: the _why_, including the options rejected                  |

## Per workspace

| Workspace         | Docs                                                                                                                                                                                      | Readme                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `@repo/api`       | [architecture](../apps/api/docs/architecture.md) · [api-reference](../apps/api/docs/api-reference.md) · [testing](../apps/api/docs/testing.md) · [decisions](../apps/api/docs/decisions/) | [apps/api](../apps/api/README.md)                     |
| `@repo/web`       | [frontend](../apps/web/docs/frontend.md) · [testing](../apps/web/docs/testing.md) · [decisions](../apps/web/docs/decisions/)                                                              | [apps/web](../apps/web/README.md)                     |
| `@repo/e2e`       | —                                                                                                                                                                                         | [apps/e2e](../apps/e2e/README.md)                     |
| `@repo/workflow`  | —                                                                                                                                                                                         | [packages/workflow](../packages/workflow/README.md)   |
| `@repo/types`     | —                                                                                                                                                                                         | [packages/types](../packages/types/README.md)         |
| `@repo/factories` | —                                                                                                                                                                                         | [packages/factories](../packages/factories/README.md) |

For setup and commands, see the [root README](../README.md). For an account of
how this was built with an AI agent — including the two bugs that only surfaced
at runtime — see [AI_NOTES.md](../AI_NOTES.md).

## Screenshots

`docs/images/` holds three captures from a real session, referenced from the
README and the frontend doc: the editor with a validation warning, a run
mid-flight, and a finished run.

## Conventions in these docs

- **A doc lives next to what it describes.** Anything in this directory should be
  something no single workspace could own; if it drifts toward one side, it moves.
- Known gaps are called out in place rather than collected into a footnote. The
  largest one: **`apps/web` has no component tests** — the app is covered end to
  end by `@repo/e2e` instead, which is a deliberate ordering rather than an
  oversight. See [testing.md](./testing.md).
- Anything stated as a measurement was measured. Claims that are reasoned rather
  than measured say so (the 500-node scaling notes, for instance).
