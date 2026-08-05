import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type FinalConnectionState,
  type IsValidConnection,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import { useCallback, type DragEvent } from 'react';

import type { NodeKind } from '@repo/types';
import { NODE_KIND_META } from '@repo/workflow';

import { useGraphStore, useIsRunActive, useToastStore, type AppEdge, type AppNode } from '../state/index.ts';
import { CanvasEmptyState } from './CanvasEmptyState.tsx';
import { WorkflowEdgeLine } from './WorkflowEdgeLine.tsx';
import { WorkflowNodeCard } from './WorkflowNodeCard.tsx';

/** MIME-ish key for the palette's drag payload. */
export const NODE_DRAG_TYPE = 'application/wand-node';

// Defined at module scope: React Flow warns — and remounts every node,
// discarding its DOM state — if these object identities change between renders.
const nodeTypes = {
  input: WorkflowNodeCard,
  transform: WorkflowNodeCard,
  output: WorkflowNodeCard,
};
const edgeTypes = { workflow: WorkflowEdgeLine };
const defaultEdgeOptions = { type: 'workflow' } as const;

/**
 * The canvas.
 *
 * **Why React Flow rather than raw SVG.** Pan, zoom, hit-testing, edge routing
 * and handle geometry are solved problems with a lot of fiddly edge cases, and
 * none of them are what this exercise is about. The cost is a dependency that
 * owns interaction; the mitigation is that it owns *only* interaction — the
 * graph lives in `graph.store`, run state lives in `run.store`, and the rules
 * live in `@repo/workflow`. React Flow never decides anything. If it had to go,
 * what changes is this file, `WorkflowNodeCard`, `WorkflowEdgeLine`, and
 * `toWorkflow` — not the model.
 *
 * **How it holds up as node count grows.** Nodes are `memo`'d and subscribe
 * individually to run state, so streaming is O(events) not O(events × nodes).
 * The next thing to give would be React Flow's own rendering of everything in
 * the viewport at once; the fix is its `onlyRenderVisibleElements`, which is a
 * prop, not a rewrite.
 */
export function WorkflowCanvas() {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const onNodesChange = useGraphStore((state) => state.onNodesChange);
  const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
  const onConnect = useGraphStore((state) => state.onConnect);
  const select = useGraphStore((state) => state.select);
  const addNode = useGraphStore((state) => state.addNode);
  const isConnectionAllowed = useGraphStore((state) => state.isConnectionAllowed);
  const hasNodes = useGraphStore((state) => state.nodes.length > 0);

  const isRunning = useIsRunActive();
  const pushToast = useToastStore((state) => state.push);
  const { screenToFlowPosition } = useReactFlow();

  /**
   * The guard that stops an invalid edge from ever existing. It runs live while
   * the user drags, so an illegal target refuses the drop rather than being
   * created and then flagged. A rule you *feel* beats a rule you have to read.
   */
  const isValidConnection = useCallback<IsValidConnection<AppEdge>>(
    (connection) => Boolean(connection.source && connection.target && isConnectionAllowed(connection.source, connection.target).ok),
    [isConnectionAllowed],
  );

  /** …but a rule the user can't see is a rule they'll fight. Say why it refused. */
  const onConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return;

      const from = connectionState.fromNode?.id;
      const to = connectionState.toNode?.id;
      // Dropping on empty canvas is a cancel, not a mistake — stay quiet.
      if (!from || !to || from === to) return;

      const verdict = isConnectionAllowed(from, to);
      if (!verdict.ok) pushToast({ tone: 'warn', message: verdict.reason });
    },
    [isConnectionAllowed, pushToast],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      // The inspector edits one node, so a multi-select shows nothing rather
      // than pretending the first one is "the" selection.
      select(selectedNodes.length === 1 ? (selectedNodes[0]?.id ?? null) : null);
    },
    [select],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData(NODE_DRAG_TYPE) as NodeKind;
      if (!NODE_KIND_META[kind]) return;

      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      // Offset so the node lands centred under the cursor rather than hanging
      // off its top-left corner.
      addNode(kind, { x: point.x - 110, y: point.y - 44 });
    },
    [addNode, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div className="canvas" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow<AppNode, AppEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => select(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        // Editing mid-run would desync the canvas from the graph the server is
        // executing, and there is no sane answer for "you deleted a node that
        // is currently running". So the graph is read-only while a run is in
        // flight — panning, zooming and selecting all still work.
        nodesDraggable={!isRunning}
        nodesConnectable={!isRunning}
        deleteKeyCode={isRunning ? null : ['Backspace', 'Delete']}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(node) => `var(--kind-${(node as AppNode).data.kind})`} maskColor="rgba(8,10,15,0.7)" />
      </ReactFlow>

      {hasNodes ? null : <CanvasEmptyState />}
    </div>
  );
}
