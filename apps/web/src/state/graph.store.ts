import { applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { NodeConfig, NodeKind, Workflow, WorkflowEdge, WorkflowNode } from '@repo/types';
import { canConnect, defaultConfig, type ConnectVerdict } from '@repo/workflow';

/**
 * The authored graph — what the user built.
 *
 * **Why two stores, split by lifetime rather than by feature.** This one changes
 * only on user intent and is the thing worth persisting. `run.store` changes
 * many times a second and is owned entirely by the stream. Keeping them apart
 * is what stops a run from re-rendering the canvas: a `node.updated` event
 * touches `run.store` only, so the node array React Flow diffs never changes
 * identity mid-run, and each node component subscribes to its own slice of run
 * state. One event re-renders one node. That's the property that still holds at
 * 500 nodes.
 *
 * **Why React Flow's shape is the storage format.** The alternative — a domain
 * model kept in sync with a React Flow model — is two representations and a
 * reconciliation bug waiting to happen. Instead there is one, converted to the
 * wire `Workflow` at the boundary in `toWorkflow`. Swapping React Flow out means
 * rewriting that function and the three change handlers, not the store.
 */

/**
 * A node's payload, as a discriminated union rather than
 * `{ kind: NodeKind; config: NodeConfig }`.
 *
 * The product type would typecheck but narrow nothing: `switch (data.kind)`
 * would leave `data.config` as the union of all three, and every read would
 * need a cast. Correlating them here is what lets `WorkflowNodeCard` and
 * `StepInspector` branch on kind and get the right config for free.
 *
 * The index signature is React Flow's constraint — `Node<T>` requires
 * `T extends Record<string, unknown>` — and each member has to carry it for the
 * union as a whole to satisfy that.
 */
type NodeDataFor<K extends NodeKind> = {
  kind: K;
  config: NodeConfig<K>;
  [key: string]: unknown;
};

export type NodeData = NodeDataFor<'input'> | NodeDataFor<'transform'> | NodeDataFor<'output'>;

/**
 * The React Flow node `type` — one value for all three kinds, and deliberately
 * *not* named after a kind.
 *
 * React Flow renders every node with the class `react-flow__node-${type}`, and
 * its stylesheet ships built-in styles for the type names `input`, `default`,
 * `output` and `group` (white card, border, padding). Naming our types after
 * our kinds meant Input and Output silently inherited React Flow's default card
 * *underneath* ours — a white rectangle peeking out behind two of the three
 * node kinds, and only those two, which is what made it look like a rendering
 * glitch rather than a name collision.
 *
 * Since `data.kind` already drives everything about how a node looks, one
 * neutral type name removes the whole class of problem.
 */
export const WORKFLOW_NODE_TYPE = 'workflow';

export type AppNode = Node<NodeData, typeof WORKFLOW_NODE_TYPE>;
export type AppEdge = Edge;

interface GraphState {
  nodes: AppNode[];
  edges: AppEdge[];
  selectedNodeId: string | null;

  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  addNode: (kind: NodeKind, position: { x: number; y: number }) => string;
  updateConfig: (nodeId: string, patch: Partial<NodeConfig>) => void;
  deleteNode: (nodeId: string) => void;
  select: (nodeId: string | null) => void;
  clear: () => void;
  loadExample: () => void;

  isConnectionAllowed: (source: string, target: string) => ConnectVerdict;
  toWorkflow: () => Workflow;
}

let nodeCounter = 0;

function nextNodeId(kind: NodeKind): string {
  nodeCounter += 1;
  return `${kind}-${Date.now().toString(36)}-${nodeCounter}`;
}

export const useGraphStore = create<GraphState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,

      onNodesChange: (changes) =>
        set((state) => {
          const nodes = applyNodeChanges(changes, state.nodes);

          // React Flow emits removals for the keyboard delete too, so edge
          // cleanup and selection have to be handled here rather than only in
          // `deleteNode` — otherwise ⌫ leaves dangling edges behind.
          const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
          if (removed.size === 0) return { nodes };

          return {
            nodes,
            edges: state.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
            selectedNodeId: state.selectedNodeId && removed.has(state.selectedNodeId) ? null : state.selectedNodeId,
          };
        }),

      onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

      onConnect: (connection) => {
        const { source, target } = connection;
        if (!source || !target) return;
        // Belt and braces: the canvas also refuses this at drag time, but the
        // store is the thing that owns the invariant.
        if (!get().isConnectionAllowed(source, target).ok) return;

        set((state) => ({ edges: [...state.edges, { id: `edge-${source}-${target}`, source, target, type: 'workflow' }] }));
      },

      addNode: (kind, position) => {
        const id = nextNodeId(kind);
        set((state) => ({
          // `kind` is a variable here, so TS can't prove `defaultConfig(kind)`
          // produces the config for *that* member of the union. One cast at the
          // single construction site, rather than at every read.
          nodes: [...state.nodes, { id, type: WORKFLOW_NODE_TYPE, position, data: { kind, config: defaultConfig(kind) } as NodeData }],
          // Select on add, so the inspector is already showing the thing the
          // user just created and they can name it without a second click.
          selectedNodeId: id,
        }));
        return id;
      },

      updateConfig: (nodeId, patch) =>
        set((state) => ({
          nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, config: { ...node.data.config, ...patch } } as NodeData } : node)),
        })),

      deleteNode: (nodeId) =>
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== nodeId),
          edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        })),

      select: (nodeId) => set({ selectedNodeId: nodeId }),

      clear: () => set({ nodes: [], edges: [], selectedNodeId: null }),

      loadExample: () => set(exampleGraph()),

      isConnectionAllowed: (source, target) => canConnect(get().toWorkflow(), source, target),

      toWorkflow: () => {
        const { nodes, edges } = get();
        return {
          version: 1,
          name: 'Untitled workflow',
          nodes: nodes.map(
            (node) =>
              ({
                id: node.id,
                kind: node.data.kind,
                // Rounded because sub-pixel drag positions are noise on the
                // wire and make two identical graphs compare unequal.
                position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
                config: node.data.config,
              }) as WorkflowNode,
          ),
          edges: edges.map((edge): WorkflowEdge => ({ id: edge.id, source: edge.source, target: edge.target })),
        };
      },
    }),
    {
      // The `.v1` is historical and part of the key's identity — changing it
      // would orphan every saved graph and make the migration below dead code.
      // `version` is the migration counter within that key.
      name: 'wand.canvas.v1',
      version: 2,
      // v1 stored the React Flow node `type` as the node kind, which collided
      // with React Flow's built-in `input`/`output` node styles. Rewriting the
      // type on load means an existing tab picks up the fix on refresh instead
      // of keeping a stale white card forever.
      migrate: (persisted, version) => {
        const state = persisted as { nodes?: AppNode[]; edges?: AppEdge[] };
        if (version >= 2 || !state?.nodes) return state;
        return { ...state, nodes: state.nodes.map((node) => ({ ...node, type: WORKFLOW_NODE_TYPE })) };
      },
      // Selection is ephemeral; the graph is not. Losing a half-built layout to
      // an accidental refresh is the kind of thing that makes a builder feel
      // untrustworthy, and it costs one line to avoid.
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
    },
  ),
);

/** A working graph with a fan-out and a fan-in, so Run does something visible. */
function exampleGraph(): Pick<GraphState, 'nodes' | 'edges' | 'selectedNodeId'> {
  const make = (id: string, kind: NodeKind, x: number, y: number, config: Partial<NodeConfig>): AppNode => ({
    id,
    type: WORKFLOW_NODE_TYPE,
    position: { x, y },
    data: { kind, config: { ...defaultConfig(kind), ...config } } as NodeData,
  });

  return {
    selectedNodeId: null,
    nodes: [
      make('example-input', 'input', 0, 150, { label: 'Customer note', value: '  Wand Studio Workflows  ' }),
      make('example-slug', 'transform', 280, 40, { label: 'Slugify', operation: 'slugify' }),
      make('example-shout', 'transform', 280, 260, { label: 'Shout', operation: 'uppercase' }),
      make('example-tag', 'transform', 560, 40, { label: 'Tag', operation: 'prefix', prefix: 'note/' }),
      make('example-output', 'output', 840, 150, { label: 'Deliver', destination: 'webhook' }),
    ],
    edges: [
      { id: 'edge-1', source: 'example-input', target: 'example-slug', type: 'workflow' },
      { id: 'edge-2', source: 'example-input', target: 'example-shout', type: 'workflow' },
      { id: 'edge-3', source: 'example-slug', target: 'example-tag', type: 'workflow' },
      { id: 'edge-4', source: 'example-tag', target: 'example-output', type: 'workflow' },
      { id: 'edge-5', source: 'example-shout', target: 'example-output', type: 'workflow' },
    ],
  };
}
