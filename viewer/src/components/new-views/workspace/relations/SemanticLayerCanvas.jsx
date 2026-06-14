import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useNodesInitialized,
} from 'reactflow';
import 'reactflow/dist/style.css';
import useStore from '../../../../stores/store';
import { useRelationErdDag } from './useRelationErdDag';
import { useModelColumns } from './useModelColumns';
import { groupFieldsByModel } from './semanticFields';
import SemanticLayerErdModelNode from './SemanticLayerErdModelNode';
import RelationNode from './RelationNode';
import JoinOperatorPopover from './JoinOperatorPopover';
import RelationLinkEdge from './RelationLinkEdge';
import { mergeById } from './erdNodeMerge';
import ErdTidyButton from './ErdTidyButton';

/**
 * SemanticLayerCanvas — the project-wide Semantic Layer ERD (VIS-1014).
 *
 * Wrapped in a ReactFlowProvider (the custom edge + pill use useReactFlow /
 * useStore(nodeInternals) / screenToFlowPosition, which throw without it).
 * Controlled draggable nodes with per-scope session persistence and a Tidy
 * (re-layout) action. scopeKey = 'semantic-layer'.
 *
 * data-testid: `semantic-layer-erd`.
 */
const SCOPE_KEY = 'semantic-layer';

const EmptyState = () => (
  <div
    data-testid="semantic-layer-erd-empty"
    className="flex flex-1 items-center justify-center bg-gray-50 p-12 text-center"
  >
    <div className="max-w-[380px] rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-[15px] font-semibold text-gray-900">No models yet</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
        Add models with metrics and dimensions to see your semantic layer here, then drag a column
        from one model onto another to relate them.
      </p>
    </div>
  </div>
);

const SemanticLayerCanvasInner = () => {
  const fetchModels = useStore(s => s.fetchModels);
  const fetchRelations = useStore(s => s.fetchRelations);
  const fetchMetrics = useStore(s => s.fetchMetrics);
  const fetchDimensions = useStore(s => s.fetchDimensions);
  const models = useStore(s => s.models);
  const metrics = useStore(s => s.metrics);
  const dimensions = useStore(s => s.dimensions);

  // Session-persisted layout for this scope (positions + waypoints + version).
  const erdLayout = useStore(s => s.getErdLayout(SCOPE_KEY));
  const layoutVersion = useStore(s => s.workspaceErdLayoutVersion[SCOPE_KEY] || 0);
  const setErdNodePositions = useStore(s => s.setErdNodePositions);
  const clearErdLayout = useStore(s => s.clearErdLayout);
  const openEditRelationModal = useStore(s => s.openEditRelationModal);
  const getRelationByName = useStore(s => s.getRelationByName);
  const savedPositions = erdLayout.nodes;

  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  // Hydrate every collection the project ERD reads from.
  useEffect(() => {
    if ((!models || models.length === 0) && typeof fetchModels === 'function') fetchModels();
    if (typeof fetchRelations === 'function') fetchRelations();
    if ((!metrics || metrics.length === 0) && typeof fetchMetrics === 'function') fetchMetrics();
    if ((!dimensions || dimensions.length === 0) && typeof fetchDimensions === 'function')
      fetchDimensions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allModelNames = useMemo(() => (models || []).map(m => m.name), [models]);
  const { columnsByModel } = useModelColumns(allModelNames);

  const fieldsByModel = useMemo(
    () => groupFieldsByModel(models || [], metrics || [], dimensions || []),
    [models, metrics, dimensions]
  );

  const { nodes: baseNodes, edges } = useRelationErdDag({
    columnsByModel,
    fieldsByModel,
    layout: 'grid',
    savedPositions,
    layoutVersion,
  });

  // The hook already folded metrics/dimensions into each MODEL node's data and
  // sized the card; the Semantic Layer just swaps the model card type in for its
  // richer renderer. Relation nodes keep their own `relationNode` type.
  const seededNodes = useMemo(
    () =>
      baseNodes.map(node =>
        node.type === 'erdModelNode' ? { ...node, type: 'semanticLayerModelNode' } : node
      ),
    [baseNodes]
  );

  const nodeTypes = useMemo(
    () => ({ semanticLayerModelNode: SemanticLayerErdModelNode, relationNode: RelationNode }),
    []
  );
  const edgeTypes = useMemo(() => ({ relationLinkEdge: RelationLinkEdge }), []);

  // Click a relation node → open the existing relation editor.
  const onNodeClick = useCallback(
    (_event, node) => {
      if (node?.type === 'relationNode' && node.data?.relationName) {
        const relation = getRelationByName
          ? getRelationByName(node.data.relationName)
          : { name: node.data.relationName };
        if (openEditRelationModal) openEditRelationModal(relation);
      }
    },
    [getRelationByName, openEditRelationModal]
  );

  // Controlled nodes: keep a moved/in-flight node, overlay saved, seed new, drop
  // deleted (mergeById §6). Effect deps mirror the hook's memo keys via the
  // seededNodes identity + scopeKey + layoutVersion.
  const [rfNodes, setRfNodes] = useState([]);
  useEffect(() => {
    setRfNodes(prev => mergeById(prev, seededNodes, savedPositions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededNodes, layoutVersion]);

  const onNodesChange = useCallback(
    changes => setRfNodes(ns => applyNodeChanges(changes, ns)),
    []
  );
  const onNodeDragStop = useCallback(
    (_event, node) => {
      if (node && setErdNodePositions) {
        setErdNodePositions(SCOPE_KEY, { [node.id]: node.position });
      }
    },
    [setErdNodePositions]
  );

  // Imperative fit on mount (and on Tidy) — never after a drag-stop. Wait for
  // `nodesInitialized` (React Flow has measured every card) so fitView frames the
  // real bounding box instead of no-opping on unmeasured nodes.
  const didMountFit = useRef(false);
  useEffect(() => {
    if (nodesInitialized && !didMountFit.current && rfNodes.length > 0) {
      didMountFit.current = true;
      fitView({ padding: 0.2, maxZoom: 1.2 });
    }
  }, [nodesInitialized, rfNodes.length, fitView]);

  const handleTidy = useCallback(() => {
    if (clearErdLayout) clearErdLayout(SCOPE_KEY);
    // The version bump reseeds rfNodes; fit after the reseed settles.
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.2 }), 0);
  }, [clearErdLayout, fitView]);

  const hasEdits = Object.keys(savedPositions || {}).length > 0;

  // Author-a-relation flow (mirrors RelationErdCanvas).
  const connectStartRef = useRef(null);
  const [popover, setPopover] = useState(null);

  const modelNameForNode = useCallback(
    nodeId => {
      const node = rfNodes.find(n => n.id === nodeId);
      return node?.data?.name || null;
    },
    [rfNodes]
  );

  const onConnectStart = useCallback((_event, params) => {
    connectStartRef.current = params;
  }, []);

  const isValidConnection = useCallback(connection => connection.source !== connection.target, []);

  const onConnect = useCallback(
    connection => {
      const sourceModel = modelNameForNode(connection.source);
      const targetModel = modelNameForNode(connection.target);
      if (!sourceModel || !targetModel || sourceModel === targetModel) return;
      setPopover({
        x: window.innerWidth / 2 - 160,
        y: 120,
        initialA: { model: sourceModel, column: connection.sourceHandle || '' },
        initialB: { model: targetModel, column: connection.targetHandle || '' },
      });
    },
    [modelNameForNode]
  );

  const onConnectEnd = useCallback(
    event => {
      const start = connectStartRef.current;
      connectStartRef.current = null;
      const targetIsPane = event?.target?.classList?.contains?.('react-flow__pane') ?? false;
      if (!targetIsPane || !start) return;
      const sourceModel = modelNameForNode(start.nodeId);
      if (!sourceModel) return;
      setPopover(prev =>
        prev
          ? prev
          : {
              x: (event.clientX || window.innerWidth / 2) + 8,
              y: event.clientY || 120,
              initialA: { model: sourceModel, column: start.handleId || '' },
              initialB: { model: '', column: '' },
            }
      );
    },
    [modelNameForNode]
  );

  const closePopover = useCallback(() => setPopover(null), []);
  const handlePopoverSaved = useCallback(() => {
    if (typeof fetchRelations === 'function') fetchRelations();
  }, [fetchRelations]);

  const hasModels = seededNodes.length > 0;

  return (
    <div data-testid="semantic-layer-erd" className="relative flex h-full w-full flex-col">
      {!hasModels ? (
        <EmptyState />
      ) : (
        <div className="relative flex flex-1 flex-col">
          <div
            data-testid="semantic-layer-erd-toolbar"
            className="flex items-center justify-end gap-2 border-b border-gray-100 bg-white px-3 py-1.5"
          >
            <ErdTidyButton
              onTidy={handleTidy}
              hasEdits={hasEdits}
              testId="semantic-layer-erd-reset-layout"
            />
          </div>
          <div className="relative flex-1">
            <ReactFlow
              nodes={rfNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              onConnectStart={onConnectStart}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              minZoom={0.1}
              maxZoom={2}
              fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
              style={{ background: '#f8fafc' }}
            >
              <Background color="#e2e8f0" gap={16} />
              <Controls />
              <MiniMap style={{ background: '#f1f5f9' }} />
            </ReactFlow>
          </div>
        </div>
      )}

      {popover && (
        <JoinOperatorPopover
          x={popover.x}
          y={popover.y}
          models={models || []}
          initialA={popover.initialA}
          initialB={popover.initialB}
          onClose={closePopover}
          onSaved={handlePopoverSaved}
        />
      )}
    </div>
  );
};

const SemanticLayerCanvas = props => (
  <ReactFlowProvider>
    <SemanticLayerCanvasInner {...props} />
  </ReactFlowProvider>
);

export default SemanticLayerCanvas;
