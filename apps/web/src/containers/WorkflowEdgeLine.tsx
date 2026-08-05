import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

import { useRunStore } from '../state/index.ts';

/**
 * Edges carry run state too.
 *
 * Without this the canvas shows *where* work is happening but not that anything
 * is moving between steps, and "feels alive" is most of the brief. An edge is
 * `flowing` when its source has produced a value and its target is consuming
 * it — that's the moment data is actually in transit.
 *
 * Same per-edge subscription trick as the nodes: the selector returns a plain
 * string, so an event that doesn't change *this* edge's state is referentially
 * equal and React bails out.
 */
function WorkflowEdgeLineImpl({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }: EdgeProps) {
  const state = useRunStore((store) => {
    const from = store.nodeStates[source]?.status;
    const to = store.nodeStates[target]?.status;

    if (from === 'succeeded' && to === 'running') return 'flowing';
    if (to === 'skipped' || to === 'canceled' || from === 'failed') return 'dead';
    if (from === 'succeeded') return 'done';
    return 'idle';
  });

  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  return (
    <>
      {/* `markerEnd` is spread rather than passed directly: with
          exactOptionalPropertyTypes, handing an optional prop an explicit
          `undefined` is an error. */}
      <BaseEdge id={id} path={path} {...(markerEnd === undefined ? {} : { markerEnd })} className="wf-edge" data-state={state} />
      {state === 'flowing' ? (
        // A dash-offset animation on a second path: no React re-render per
        // frame, and it stops the instant the state flips back.
        <path className="wf-edge__flow" d={path} fill="none" />
      ) : null}
    </>
  );
}

export const WorkflowEdgeLine = memo(WorkflowEdgeLineImpl);
