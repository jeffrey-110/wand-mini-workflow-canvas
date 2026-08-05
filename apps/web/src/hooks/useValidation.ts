import { useMemo } from 'react';

import type { ValidationResult } from '@repo/types';
import { validateWorkflow } from '@repo/workflow';

import { useGraphStore } from '../state/index.ts';

/**
 * Live validation, recomputed from the graph rather than stored alongside it —
 * so there is no way for the two to disagree, and no invalidation to forget.
 *
 * **This runs the same module the API runs.** The client copy exists for
 * latency: the user sees a bad edge refused in the frame they drew it, and the
 * issue list updates as they type. The server copy is the authority and re-runs
 * on every `POST /api/runs`, so a client that skipped its checks — or a
 * hand-written curl — still can't start a bad run. There is a
 * `POST /api/workflows/validate` endpoint too; the editor deliberately doesn't
 * call it per keystroke, because a round trip per edit would make the
 * connection guard feel laggy for an identical answer.
 *
 * **Where this stops scaling.** It's O(V+E) per edit on the render path, which
 * is fine at the scale this tool targets. At 500 nodes I'd move it off the
 * render path — a store subscription recomputing on a trailing debounce, or a
 * worker — and make the cheap per-edge guard (`canConnect`) the only thing that
 * stays synchronous, since that one has to be instant to feel right.
 */
export function useValidation(): ValidationResult {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const toWorkflow = useGraphStore((state) => state.toWorkflow);

  return useMemo(() => validateWorkflow(toWorkflow()), [nodes, edges, toWorkflow]);
}
