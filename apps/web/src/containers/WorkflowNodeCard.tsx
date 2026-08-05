import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

import { NODE_KIND_META } from '@repo/workflow';

import { formatDuration, NODE_STATUS_META, truncate } from '../lib/status.ts';
import { useNodeRunState, type AppNode } from '../state/index.ts';

/**
 * A single step on the canvas.
 *
 * **This component is where the state split pays off.** `memo` plus a per-node
 * subscription to `run.store` means a `node.updated` event for step A
 * re-renders step A and nothing else — the node array React Flow holds never
 * changes during a run, so there is no canvas-wide reconciliation per event.
 *
 * The handles are conditional on the kind's source/sink rules, so an Input
 * simply has no target handle to drop onto. Making the illegal thing
 * *unclickable* is better than making it clickable and then complaining.
 */
function WorkflowNodeCardImpl({ id, data, selected }: NodeProps<AppNode>) {
  const runState = useNodeRunState(id);
  const meta = NODE_KIND_META[data.kind];
  const statusMeta = runState ? NODE_STATUS_META[runState.status] : null;

  const duration = runState?.startedAt !== undefined && runState.finishedAt !== undefined ? formatDuration(runState.startedAt, runState.finishedAt) : null;

  return (
    <div
      className="wf-node"
      data-kind={data.kind}
      data-status={runState?.status ?? 'idle'}
      data-selected={selected ? '' : undefined}
      aria-label={`${meta.title} step: ${data.config.label}${statusMeta ? `, ${statusMeta.label}` : ''}`}
    >
      {meta.acceptsInbound ? <Handle type="target" position={Position.Left} className="wf-handle" /> : null}

      <header className="wf-node__head">
        <span className="wf-node__kind">{meta.title}</span>
        {statusMeta ? (
          <span className="wf-node__status">
            <span aria-hidden>{statusMeta.glyph}</span>
            {statusMeta.label}
          </span>
        ) : null}
      </header>

      <p className="wf-node__title">{data.config.label.trim() || meta.title}</p>
      <p className="wf-node__summary">{summarise(data)}</p>

      <footer className="wf-node__foot">
        <span className="wf-node__result">{resultLine(runState)}</span>
        {duration ? <span className="wf-node__duration">{duration}</span> : null}
      </footer>

      {/* The running glow is its own element rather than an animation on the
          card, so the browser can composite it without repainting the text
          underneath on every frame. */}
      {runState?.status === 'running' ? <span className="wf-node__pulse" aria-hidden /> : null}

      {meta.emitsOutbound ? <Handle type="source" position={Position.Right} className="wf-handle" /> : null}
    </div>
  );
}

/** The one line of config worth showing without opening the inspector. */
function summarise(data: AppNode['data']): string {
  switch (data.kind) {
    case 'input':
      return data.config.value.trim() ? `“${truncate(data.config.value.trim(), 34)}”` : 'No value set';
    case 'transform':
      return data.config.operation === 'prefix' ? `prefix “${truncate(data.config.prefix, 18) || '…'}”` : data.config.operation;
    case 'output':
      return `→ ${data.config.destination}`;
  }
}

/**
 * What the step produced, or why it didn't. Showing the real value is what
 * makes a run inspectable rather than a light show — you can see at a glance
 * that the wiring was right, not just that something happened.
 */
function resultLine(state: ReturnType<typeof useNodeRunState>): string {
  if (!state) return '';
  if (state.status === 'failed') return state.error ?? 'Failed';
  if (state.status === 'skipped') return 'Upstream step failed';
  if (state.status === 'canceled') return 'Canceled';
  if (state.output !== undefined) return `→ ${state.output || '(empty)'}`;
  return '';
}

export const WorkflowNodeCard = memo(WorkflowNodeCardImpl);
