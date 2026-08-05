import { useReactFlow } from '@xyflow/react';

import { NODE_KINDS, type NodeKind } from '@repo/types';
import { NODE_KIND_META } from '@repo/workflow';

import { useGraphStore, useIsRunActive } from '../state/index.ts';
import { NODE_DRAG_TYPE } from './WorkflowCanvas.tsx';

/** Kept in sync by hand with `hooks/useKeyboardShortcuts.ts` — it's four rows. */
const SHORTCUTS: ReadonlyArray<{ keys: readonly string[]; label: string }> = [
  { keys: ['⌘', '↵'], label: 'Run' },
  { keys: ['⌘', '.'], label: 'Cancel run' },
  { keys: ['⌫'], label: 'Delete step' },
  { keys: ['esc'], label: 'Deselect' },
];

/**
 * Two ways to add a step, because both habits exist: drag it where you want it,
 * or click and let the canvas place it.
 *
 * Click-to-add drops the node in the middle of the *current viewport* rather
 * than at the graph origin, so it lands where the user is actually looking —
 * otherwise the first click after panning appears to do nothing.
 */
export function StepPalette() {
  const addNode = useGraphStore((state) => state.addNode);
  const nodeCount = useGraphStore((state) => state.nodes.length);
  const isRunning = useIsRunActive();
  const { screenToFlowPosition } = useReactFlow();

  function addAtViewportCentre(kind: NodeKind): void {
    const pane = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
    const centre = pane ? screenToFlowPosition({ x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 }) : { x: 0, y: 0 };

    // Cascade successive additions so they don't stack perfectly and look like
    // one node.
    const offset = (nodeCount % 5) * 28;
    addNode(kind, { x: centre.x - 110 + offset, y: centre.y - 44 + offset });
  }

  return (
    <nav className="palette" aria-label="Add steps">
      <h2 className="palette__title">Steps</h2>

      {NODE_KINDS.map((kind) => {
        const meta = NODE_KIND_META[kind];
        return (
          <button
            key={kind}
            type="button"
            className="palette__item"
            data-kind={kind}
            draggable={!isRunning}
            disabled={isRunning}
            title={isRunning ? "Can't edit the graph while a run is in flight" : `Add a ${meta.title} step`}
            onDragStart={(event) => {
              event.dataTransfer.setData(NODE_DRAG_TYPE, kind);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => addAtViewportCentre(kind)}
          >
            <span className="palette__dot" aria-hidden />
            <span className="palette__body">
              <span className="palette__name">{meta.title}</span>
              <span className="palette__blurb">{meta.blurb}</span>
            </span>
          </button>
        );
      })}

      <div className="palette__footer">
        <h3>Shortcuts</h3>
        {/* Each row is `display: contents` inside a two-column grid, so the
            keycap column sizes itself to the widest combination and every label
            starts at the same x — without hard-coding a width that `esc` or a
            two-key chord would break. */}
        <ul>
          {SHORTCUTS.map(({ keys, label }) => (
            <li key={label}>
              <span className="palette__keys">
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
              <span className="palette__shortcut">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
