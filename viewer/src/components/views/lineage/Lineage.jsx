import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import useStore from '../../../stores/store';
import { useLineageDag, computeLayout } from './useLineageDag';
import SourceNode from './SourceNode';
import ModelNode from './ModelNode';
import DimensionNode from './DimensionNode';
import MetricNode from './MetricNode';
import RelationNode from './RelationNode';
import InsightNode from './InsightNode';
import MarkdownNode from './MarkdownNode';
import ChartNode from './ChartNode';
import TableNode from './TableNode';
import DashboardNode from './DashboardNode';
import InputNode from './InputNode';
import { PiArrowCounterClockwise } from 'react-icons/pi';
import LineageSelectorField from './LineageSelectorField';
import { neighborhoodSelector, subjectOf } from './lineageSelector';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { formatRefExpression } from '../../../utils/refString';

/**
 * Lineage - Lineage view for sources, models, dimensions, metrics, relations, and insights
 * Supports drag-to-connect edges between sources and models
 *
 * Props (all optional — every live mount is via `<LineageCanvas>` in the
 * Workspace middle pane; `/editor` and `/lineage` are redirects now):
 *   - `scopeSelector`  — externally-derived selector string (e.g. `*`,
 *                        `+dashboardName`). When provided it seeds the
 *                        internal selector and re-syncs whenever the prop
 *                        changes (so the Workspace scope drives the DAG).
 *                        The manual selector input still overrides it until
 *                        the prop changes again.
 *   - `onNodeSelect`   — called with `{ type, name }` when a node is clicked,
 *                        so a host (the Workspace MiddlePane) can round-trip
 *                        the selection into its own selection state.
 *   - `headerSlot`     — optional React node rendered to the left of the
 *                        selector input bar (used by `<LineageCanvas>` to
 *                        mount the scope-indicator chrome).
 *   - `onNodeContextMenu` — called with `(event, { type, name })` when a node
 *                        is right-clicked (VIS-811 / Track O O-2) so a host
 *                        can mount an "Open / Open in new tab" context menu.
 *                        When provided, the browser's default menu is
 *                        suppressed for node right-clicks only.
 */
// Fallbacks for centring before React Flow has measured a node. These mirror
// computeLayout's estimate so the camera lands where the layout put it.
const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 50;

const Lineage = ({
  scopeSelector = null,
  onNodeSelect = null,
  onResetScope = null,
  onNodeContextMenu = null,
} = {}) => {
  // Sources
  const fetchSources = useStore(state => state.fetchSources);
  const sourcesError = useStore(state => state.sourcesError);

  // Models
  const models = useStore(state => state.models);
  const fetchModels = useStore(state => state.fetchModels);
  const saveModel = useStore(state => state.saveModel);

  // Other object types
  const fetchDimensions = useStore(state => state.fetchDimensions);
  const fetchMetrics = useStore(state => state.fetchMetrics);
  const fetchRelations = useStore(state => state.fetchRelations);
  const fetchInsights = useStore(state => state.fetchInsights);
  const fetchMarkdowns = useStore(state => state.fetchMarkdowns);
  const fetchCharts = useStore(state => state.fetchCharts);
  const fetchTables = useStore(state => state.fetchTables);
  const fetchDashboards = useStore(state => state.fetchDashboards);
  const fetchInputs = useStore(state => state.fetchInputs);
  const fetchDefaults = useStore(state => state.fetchDefaults);

  // When embedded in the Workspace, the host route already loads most
  // collections. We read the two slices the Workspace route does NOT
  // preload (dashboards + defaults) so we can lazily fill them without
  // re-fetching everything.
  const dashboards = useStore(state => state.dashboards);
  const defaults = useStore(state => state.defaults);

  // `*` is the unscoped sentinel from the Workspace scope hook — Lineage's
  // own grammar treats an empty selector as "show everything", so we normalise
  // `*` to `''` before it ever reaches `parseSelector`.
  const normaliseSelector = useCallback(
    (value) => (!value || value === '*' ? '' : value),
    []
  );
  const [selector, setSelector] = useState(() => normaliseSelector(scopeSelector));
  // Track the last scope prop we applied so we only re-seed the internal
  // selector when the *scope* changes — not on every render. This is what lets
  // the manual input override the scope until the scope itself changes again.
  const lastScopeRef = useRef(scopeSelector);
  // `embedded` means a host (the Workspace via <LineageCanvas>) supplies the
  // scope and has already loaded the project's collections at the route level.
  // In that mode we skip our own fetch-on-mount and render the DAG immediately
  // from the store the host populated. Standalone (`/editor`) still fetches.
  const embedded = scopeSelector != null;
  const [initialLoadDone, setInitialLoadDone] = useState(embedded);
  const [fixedNode, setFixedNode] = useState(null); // { id, position } for keeping clicked node in place

  const reactFlowInstance = useRef(null);
  // React Flow calls `onInit` AFTER the first render, and on a fresh mount
  // (opening straight onto the Lineage lens — e.g. the Library row's "Show
  // lineage") that can land after the reframe effect below has already run its
  // single pass, leaving the subject un-centred. Flip this in `onInit` and key
  // the reframe on it so the camera lands on the subject once the flow is ready.
  const [flowReady, setFlowReady] = useState(false);


  // Standalone (`/editor`): fetch every collection on mount and flip
  // `initialLoadDone` once they all resolve. Embedded (Workspace): the host
  // route already loaded the collections, so we skip the redundant fetch and
  // render the DAG immediately (initialLoadDone is seeded true). We only
  // lazily fill the two slices the Workspace route does NOT preload —
  // dashboards and defaults — and only when they're still empty.
  useEffect(() => {
    if (embedded) {
      if (!dashboards || dashboards.length === 0) {
        fetchDashboards();
      }
      if (defaults == null) {
        fetchDefaults();
      }
      return;
    }
    Promise.all([
      fetchSources(),
      fetchModels(),
      fetchDimensions(),
      fetchMetrics(),
      fetchRelations(),
      fetchInsights(),
      fetchMarkdowns(),
      fetchCharts(),
      fetchTables(),
      fetchDashboards(),
      fetchInputs(),
      fetchDefaults(),
    ]).then(() => setInitialLoadDone(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, fetchSources, fetchModels, fetchDimensions, fetchMetrics, fetchRelations, fetchInsights, fetchMarkdowns, fetchCharts, fetchTables, fetchDashboards, fetchInputs, fetchDefaults]);

  // Re-seed the internal selector when the externally-supplied scope changes.
  // The manual input mutates `selector` freely between scope changes; this
  // effect only fires when the *scope prop itself* changes value.
  useEffect(() => {
    if (scopeSelector !== lastScopeRef.current) {
      lastScopeRef.current = scopeSelector;
      setSelector(normaliseSelector(scopeSelector));
      setFixedNode(null);
    }
  }, [scopeSelector, normaliseSelector]);

  // Get DAG data
  const { nodes: dagNodes, edges: dagEdges } = useLineageDag();

  // Parse selector string into matching node IDs
  const parseSelector = useCallback((selectorStr, nodes, edges) => {
    if (!selectorStr.trim()) {
      return new Set(nodes.map(n => n.id));
    }

    // Build adjacency lists for graph traversal
    const buildAdjacencyLists = () => {
      const children = {};
      const parents = {};
      nodes.forEach(n => {
        children[n.id] = [];
        parents[n.id] = [];
      });
      edges.forEach(e => {
        if (children[e.source]) children[e.source].push(e.target);
        if (parents[e.target]) parents[e.target].push(e.source);
      });
      return { children, parents };
    };

    const { children, parents } = buildAdjacencyLists();

    // Get all descendants of a node
    const getDescendants = nodeId => {
      const result = new Set();
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift();
        (children[current] || []).forEach(child => {
          if (!result.has(child)) {
            result.add(child);
            queue.push(child);
          }
        });
      }
      return result;
    };

    // Get all ancestors of a node
    const getAncestors = nodeId => {
      const result = new Set();
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift();
        (parents[current] || []).forEach(parent => {
          if (!result.has(parent)) {
            result.add(parent);
            queue.push(parent);
          }
        });
      }
      return result;
    };

    const selected = new Set();
    const parts = selectorStr
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);

    parts.forEach(part => {
      // Check for +name+ pattern (ancestors and descendants)
      const plusMatch = part.match(/^\+(.+)\+$/);
      if (plusMatch) {
        const name = plusMatch[1];
        nodes.forEach(n => {
          if (n.data.name === name || n.id === name || n.id.endsWith(`-${name}`)) {
            selected.add(n.id);
            getDescendants(n.id).forEach(d => selected.add(d));
            getAncestors(n.id).forEach(a => selected.add(a));
          }
        });
        return;
      }

      // Check for name+ pattern (node and descendants)
      const suffixMatch = part.match(/^(.+)\+$/);
      if (suffixMatch) {
        const name = suffixMatch[1];
        nodes.forEach(n => {
          if (n.data.name === name || n.id === name || n.id.endsWith(`-${name}`)) {
            selected.add(n.id);
            getDescendants(n.id).forEach(d => selected.add(d));
          }
        });
        return;
      }

      // Check for +name pattern (node and ancestors)
      const prefixMatch = part.match(/^\+(.+)$/);
      if (prefixMatch) {
        const name = prefixMatch[1];
        nodes.forEach(n => {
          if (n.data.name === name || n.id === name || n.id.endsWith(`-${name}`)) {
            selected.add(n.id);
            getAncestors(n.id).forEach(a => selected.add(a));
          }
        });
        return;
      }

      // Plain name - just select matching nodes
      nodes.forEach(n => {
        if (n.data.name === part || n.id === part || n.id === `source-${part}` || n.id === `model-${part}` || n.id === `dimension-${part}` || n.id === `metric-${part}` || n.id === `relation-${part}` || n.id === `insight-${part}` || n.id === `markdown-${part}` || n.id === `chart-${part}` || n.id === `table-${part}`) {
          selected.add(n.id);
        }
      });
    });

    return selected;
  }, []);

  // Compute which nodes to show based on selector
  const selectedIds = useMemo(
    () => parseSelector(selector, dagNodes, dagEdges),
    [selector, dagNodes, dagEdges, parseSelector]
  );

  // Filter nodes and edges, recompute layout with only visible items, and add handlers
  const { nodes, edges } = useMemo(() => {
    // Safety check: ensure dagNodes and dagEdges are arrays
    if (!Array.isArray(dagNodes) || !Array.isArray(dagEdges)) {
      return { nodes: [], edges: [] };
    }

    // Filter to selected nodes first. Node clicks round-trip into the
    // workspace selection (right-rail Edit panel) via onNodeSelect — the
    // legacy in-canvas edit popout is gone, so no per-node edit handlers.
    const filteredNodes = dagNodes.filter(node => selectedIds.has(node.id));

    // Filter edges to only show edges between visible nodes
    const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = dagEdges.filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));

    // Recompute layout with only the filtered nodes and edges
    // Pass fixedNode to keep clicked node in place
    let layoutNodes = filteredNodes;
    try {
      layoutNodes = computeLayout(filteredNodes, filteredEdges, fixedNode);
    } catch (error) {
      console.error('Error computing layout:', error);
      // Fall back to using filteredNodes without layout if computation fails
    }

    return { nodes: layoutNodes || [], edges: filteredEdges || [] };
  }, [dagNodes, dagEdges, selectedIds, fixedNode]);

  // One reset, whatever is narrowing the view.
  //
  // There were two: `Clear`, which emptied this component's own selector, and
  // a `Show full project` button on the scope strip above, which widened the
  // host's scope. Pressing Clear while hosted did almost nothing visible — the
  // scope re-seeded the selector straight back — so the two had to be pressed
  // in the right order to get the whole project. They are now the same action.
  //
  // `onResetScope` is absent standalone (`/editor`), where there is no scope
  // and clearing the selector IS showing the full project.
  const handleShowFullProject = useCallback(() => {
    setSelector('');
    setFixedNode(null);
    if (onResetScope) onResetScope();
  }, [onResetScope]);

  // Nothing to reset when the DAG is already the whole project. A host-derived
  // scope seeds `selector`, so this covers scoped and manual narrowing alike.
  const canShowFullProject = Boolean(selector) || Boolean(fixedNode);

  // Which nodes are on screen, as a stable string. Identity, not count —
  // `nodes` is rebuilt on every layout pass, so it can't be a dependency
  // directly, but its membership can.
  const nodeSignature = useMemo(
    () => (nodes || []).map((node) => node.id).sort().join(' '),
    [nodes]
  );

  // Reframe when the node SET changes or the selector does.
  //
  // Which reframing depends on whether the selector names an object:
  //
  //   - it names one  → PAN to it, keeping the user's zoom. Clicking a node,
  //     expanding one from the mini lineage, and typing a name in the filter
  //     all change WHICH object the view is about without necessarily changing
  //     the node set — so a set-keyed fit did nothing at all, and even when it
  //     did fire, fitting the whole graph left the chosen object as one small
  //     box somewhere rather than the thing you are looking at.
  //   - it names none (`*`) → FIT the graph. That is "show full project" and
  //     the unscoped first load, where there is no subject to centre on.
  //
  // Keying on `nodes?.length` was the original bug: selecting a different
  // object that happened to resolve to the same number of nodes never re-fit.
  // Membership replaces it, and the selector is here too because editing the
  // filter is an explicit "show me this" even when the result is already on
  // screen — the user may have panned away since.
  //
  // Deliberately absent is anything that only MOVES nodes: dragging, or
  // pinning a clicked node via `fixedNode`. Those leave both triggers alone, so
  // the viewport stays where the user put it — the original "jumps on select".
  useEffect(() => {
    const instance = reactFlowInstance.current;
    if (!initialLoadDone || !instance || !(nodes?.length > 0)) return undefined;

    const timer = setTimeout(() => {
      const subject = subjectOf(selector);
      const target = subject ? nodes.find((n) => n.data?.name === subject) : null;

      if (target && typeof instance.setCenter === 'function') {
        const zoom = typeof instance.getZoom === 'function' ? instance.getZoom() : 1;
        instance.setCenter(
          target.position.x + (target.width ?? DEFAULT_NODE_WIDTH) / 2,
          target.position.y + (target.height ?? DEFAULT_NODE_HEIGHT) / 2,
          { zoom, duration: 500 }
        );
        return;
      }

      instance.fitView({
        padding: 0.2,
        duration: 800, // Smooth 800ms animation
      });
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadDone, nodeSignature, selector, flowReady]);

  // Global keyboard handler for Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Don't clear if user is typing in an input/textarea (except the selector input itself)
        const target = e.target;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        // If there's a selector active and we're not in the edit panel, clear it
        if (selector && !isInput) {
          e.preventDefault();
          e.stopPropagation();
          setSelector('');
          setFixedNode(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selector]);

  // Node types for React Flow
  const nodeTypes = useMemo(
    () => ({
      sourceNode: SourceNode,
      modelNode: ModelNode,
      dimensionNode: DimensionNode,
      metricNode: MetricNode,
      relationNode: RelationNode,
      insightNode: InsightNode,
      markdownNode: MarkdownNode,
      chartNode: ChartNode,
      tableNode: TableNode,
      dashboardNode: DashboardNode,
      inputNode: InputNode,
    }),
    []
  );

  // Handle node click - filter to show the clicked node's dependencies
  // (ancestors and descendants) and round-trip the selection to the host
  // (the Workspace), whose persistent right rail is the edit surface.
  const handleNodeClick = useCallback((event, node) => {
    const nodeName = node.data.name;
    const objectType = node.data.objectType;

    // Store the node's current position so it doesn't jump during layout recomputation
    setFixedNode({
      id: node.id,
      position: node.position,
    });

    // Set selector to +name+ to show the node and all its dependencies
    const nextSelector = neighborhoodSelector(nodeName);
    // Claim the scope this click is about to produce.
    //
    // `onNodeSelect` below tells the host, which opens the object as a tab,
    // which re-derives the scope, which arrives back here as a NEW
    // `scopeSelector` — and the re-seed effect responds to a new scope by
    // clearing `fixedNode`. So the click's own echo destroyed the pin it had
    // just set, dagre re-laid the graph from scratch, and the node the user
    // clicked moved out from under them. Recording the value now means the
    // effect sees the scope it already has and leaves the pin alone.
    lastScopeRef.current = nextSelector;
    setSelector(nextSelector);

    if (onNodeSelect) {
      onNodeSelect({ type: objectType, name: nodeName });
    }
  }, [onNodeSelect]);

  // Right-click on a node (VIS-811 / Track O O-2) — resolve the node to its
  // `{ type, name }` identity and hand it to the host with the raw event so
  // the host can position its own context menu. Suppress the browser menu
  // only when a host is actually listening.
  const handleNodeContextMenu = useCallback(
    (event, node) => {
      if (!onNodeContextMenu) return;
      event.preventDefault();
      onNodeContextMenu(event, { type: node.data.objectType, name: node.data.name });
    },
    [onNodeContextMenu]
  );

  // Handle new edge connection (drag from source to model)
  const handleConnect = useCallback(
    async params => {
      // Only allow connections from sources to models
      if (!params.source.startsWith('source-') || !params.target.startsWith('model-')) {
        return;
      }

      const sourceName = params.source.replace('source-', '');
      const modelName = params.target.replace('model-', '');

      // Find the model and update its source reference
      const model = models.find(m => m.name === modelName);
      if (model) {
        const updatedConfig = {
          ...model.config,
          name: model.name,
          sql: model.sql || model.config?.sql,
          source: formatRefExpression(sourceName),
        };
        await saveModel(modelName, updatedConfig);
        await fetchModels();
      }
    },
    [models, saveModel, fetchModels]
  );

  // Handle edge deletion
  const handleEdgesDelete = useCallback(
    async deletedEdges => {
      for (const edge of deletedEdges) {
        if (edge.target.startsWith('model-')) {
          const modelName = edge.target.replace('model-', '');
          const model = models.find(m => m.name === modelName);
          if (model) {
            const updatedConfig = {
              ...model.config,
              name: model.name,
              sql: model.sql || model.config?.sql,
              source: null,
            };
            await saveModel(modelName, updatedConfig);
          }
        }
      }
      await fetchModels();
    },
    [models, saveModel, fetchModels]
  );

  return (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'h-[calc(100vh-48px)]'}`}>

      {/* Selector bar — the only chrome above the DAG.
          There used to be a scope strip above this one carrying the same
          object's name plus this button; it said nothing this row doesn't. */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
        <LineageSelectorField
          value={selector}
          onChange={e => {
            setSelector(e.target.value);
            // Clear fixed node when manually editing selector
            if (fixedNode) setFixedNode(null);
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              handleShowFullProject();
              e.target.blur(); // Remove focus after clearing
            }
          }}
          placeholder="e.g., 'source_name', 'model_name', or '+name+'"
          testId="lineage-selector"
          trailing={
            <button
              type="button"
              onClick={handleShowFullProject}
              disabled={!canShowFullProject}
              data-testid="lineage-show-full-project"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:text-gray-900 hover:ring-gray-300 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-700 disabled:hover:ring-gray-200"
            >
              <PiArrowCounterClockwise className="h-3.5 w-3.5" />
              Show full project
            </button>
          }
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* DAG area */}
        <div className="flex-1 relative">
          {/* Loading state */}
          {!initialLoadDone && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
              <div className="text-gray-500">Loading...</div>
            </div>
          )}

          {/* Error state */}
          {sourcesError && (
            <div className="absolute top-4 left-4 right-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm z-10">
              Error loading sources: {sourcesError}
            </div>
          )}

          {/* Empty state */}
          {initialLoadDone && dagNodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-lg mb-2">No sources or models yet</div>
              <div className="text-gray-400 text-sm">
                Click the + button to create your first source or model
              </div>
            </div>
          )}

          {/* No matches state */}
          {initialLoadDone && dagNodes.length > 0 && nodes?.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-lg mb-2">No matching objects</div>
              <div className="text-gray-400 text-sm">Try a different selector or click Clear</div>
            </div>
          )}

          {/* React Flow DAG */}
          <ReactFlow
            nodes={initialLoadDone ? (nodes || []) : []}
            edges={initialLoadDone ? (edges || []) : []}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            onInit={instance => {
              reactFlowInstance.current = instance;
              setFlowReady(true);
            }}
            minZoom={0.1}
            maxZoom={2}
            style={{ background: '#f8fafc' }}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{ animated: true }}
          >
            <Background color="#e2e8f0" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={node => {
                const status = node.data?.status;
                const objectType = node.data?.objectType;
                if (status === 'new') return '#22c55e';
                if (status === 'modified') return '#f59e0b';
                // Get color from object type config
                const typeConfig = getTypeByValue(objectType);
                return typeConfig?.colors?.connectionHandle || '#94a3b8'; // gray fallback
              }}
              style={{ background: '#f1f5f9' }}
            />
          </ReactFlow>

        </div>
      </div>
    </div>
  );
};

export default Lineage;
