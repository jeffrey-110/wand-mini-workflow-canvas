# AI_NOTES

Built with Claude Code in one session. How I steered it, where it got things
wrong, and what I decided myself.

## 1. The prompts that mattered

Setting the frame before any code. I made it answer three questions before
writing anything: canvas library or hand-rolled, how far to push the three "ugly
parts", and whether to use git. React Flow, all three, no git. That's what
stopped it spending an hour on drag maths.

Specifying the structure instead of asking for one. I gave it the layout and
the conventions up front:

```
read "./Take-Home Assessment - Senior Full Stack (Wand Studio).pdf" again
before you start anything. that document is the source of truth for what this
has to do. what follows is only the shape i want the repo itself to have. if
anything here conflicts with the brief, the brief wins: say so and stop rather
than guessing.

pnpm + turborepo monorepo.

two apps: apps/api and apps/web. three shared packages: @repo/types,
@repo/workflow, and @repo/factories for test fixtures.

the packages stand on their own, independent of the apps. each one does the
single thing it is named for and nothing else. @repo/types only holds the shared
types and imports nothing. @repo/workflow only holds the workflow rules and
stays environment agnostic, no node or dom builtins. @repo/factories only builds
test fixtures. nothing in packages/ imports from apps/.

apps/web is react + vite, with react flow for the canvas. react flow owns
interaction only. it decides nothing: the graph lives in the store and the rules
live in @repo/workflow, so swapping the library out means rewriting a handful of
files rather than the model.

split the ui by what a file knows. presentational primitives that take props and
know nothing about the domain go in components/. anything wired to a store or a
service goes in containers/. network access lives in services/ and nowhere else.

every workspace is documented inside its own folder. a README.md at its root
saying what it is, how to run it and what it is allowed to depend on, and a
docs/ folder next to it for the longer material: architecture, api reference,
testing notes.

architecture decisions get written down as numbered ADRs, each one stating the
context, the decision and what it costs. a decision that only affects one
workspace lives in that workspace's docs/decisions/. anything cross cutting
lives in the root docs/decisions/. numbering runs continuously across the whole
repo, so an ADR number always means exactly one decision no matter which folder
it sits in.

the point is that each folder is self contained. someone opening apps/api
should not have to leave it to understand what it does or why it is built that
way, and the root docs/ should only hold what genuinely spans more than one
workspace.

the root README.md is the exception. that one is written for the reviewer, so it
answers the brief head on: what this is, how to run it, the architecture, the
tradeoffs the brief asks me to name, and what i cut and why.

prettier: single quotes, semicolons, trailing commas, 180 columns, 80 for
markdown.
```

Saying what each package is allowed to be, not just where its files go, made
the boundaries checkable: the `structuredClone` it later put in `@repo/workflow`
broke a stated rule. If you don't state a convention the agent invents one, and
what it invents is reasonable, generic, and yours to live with.

Challenging a justification I didn't buy. It had hand-rolled the HTTP layer.
One of its reasons:

```
`No framework - node:http + composed middleware + a route table (also avoids
framework SSE buffering surprises)` - what's with this one?
```

A rationalisation, and it folded: Fastify needs one line (`reply.hijack()`),
Express needs nothing, and the real reason was not wanting the dependency. We
went with Express and deleted about 250 lines of plumbing.

Insisting on real verification before moving on.

```
don't tell me it works because the tests pass. drive it end to end in a real
browser first and tell me what you actually saw.

then write that up as a playwright suite so it stays true. cover the happy path
properly: build a graph, run it, watch the nodes go queued -> running -> done,
and assert you saw them running, not just finished. an end state alone proves
nothing.

and cover the ways it goes wrong, not only the way it goes right. force a
failure and check the steps downstream of it are skipped rather than failed.
cancel a run mid flight and check nothing is left sitting queued. reload the
page during a run and check it picks the run back up. break the graph and check
run is actually disabled.

put it in its own workspace, not inside apps/web. it should reach the app the
way a user does and import nothing from it.

separately, there is a white background sitting behind two of the node cards.
find out why.
```

A green test run is a claim, not evidence. The browser is what found the worst
bug in the session, and the suite is what keeps it found. `@repo/e2e` is 19
tests; the one I insisted on is that a node is seen running and not only
succeeded, because the `POST /api/runs` response already shows the first node
running and a frozen canvas passes an end-state check.

The white background was me catching something it had looked past in its own
screenshots.

## 2. Where the agent was wrong

### It shipped a streaming bug that every test said was fine

The agent wrote SSE frames like this:

```
id: 7
event: node.updated
data: {"seq":7,"type":"node.updated",...}
```

That's well-formed SSE, `curl -N` was flawless, and every test passed. The
browser got nothing: an `event:` line makes `EventSource` dispatch a typed
event that never reaches an `onmessage` handler, and the client had one.

It also looked half alive, since the `POST /api/runs` snapshot already showed
the first node running, so it read as "starts then freezes" rather than "the
stream is dead" and the agent blamed the Vite proxy first. One-line fix, and a
regression test now asserts there's no `event:` line.

### It didn't see a rendering bug that was plainly visible

Two of the five node cards had a white rectangle behind them. The agent had
looked at four screenshots containing it and never mentioned it. I cropped one
and asked.

The diagnosis was good. React Flow styles `react-flow__node-${type}` and ships
defaults for `input`, `default`, `output` and `group`, and its node types were
named after its node kinds, so Input and Output inherited React Flow's white
card underneath ours. `transform` doesn't collide, which is why only two of
three were affected. The fix was right too: one neutral node type with
`data.kind` driving appearance, plus a `localStorage` migration.

But it needed a human to point at the screen. Agents are weak at "what's wrong
with this" and strong at "here's a symptom, find the cause".

## 3. What I kept for myself

The repo's shape. Specified before the first file, which is why it doesn't
read like agent output.

The framework decision. It had already built the HTTP layer and had a reason
ready. Taking the reason apart turned a defence into a comparison.

Scope. All three ugly parts, not cancellation only. That had to be decided
before the architecture, since resumable streaming constrains the event model
rather than bolting on later.

Product decisions it kept trying to make implicitly:

- Two severities for validation, where errors block Run and warnings never do,
  instead of one wall of red.
- `skipped` and `failed` visually distinct, because "one step broke, these were
  collateral" is what a person needs to see first.
- The failure-rate control as a real toolbar control, not a hidden debug flag.
- Editing locked during a run, because there's no honest answer to "you deleted
  a node that is currently running".

The verification standard. Everything here was driven in a real browser:
concurrent branches, a mid-graph failure skipping descendants, a cancel mid
flight, a reload recovering the graph. Three of those found bugs. Then I had it
write those sessions down as `@repo/e2e`, which imports nothing from the app so
a test can't assert that a value equals itself.

## What I'd do differently

I'd have given the backend the same treatment as the frontend. The frontend got
conventions up front and they were followed. The backend got none: how the
layers stack, where the trust boundary sits, what belongs in a route versus the
scheduler. It came out well because the agent chose well, not because I set the
rules. The 400/422 split is the example: `malformed_request` for "this isn't a
workflow" and `invalid_workflow` for "it parsed but isn't runnable" is exactly
right, and I didn't ask for it.

The conventions worth stating are the ones that classify: this belongs here,
that belongs there, these two failures are different kinds. I did that for the
browser and not the server.

I'd also have asked for the browser check earlier. The SSE bug sat there while
the suite got greener around it.
