import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import useStore from '../../../../stores/store';
import { useRelationErdDag } from './useRelationErdDag';
import { useModelColumns } from './useModelColumns';
import { groupFieldsByModel } from './semanticFields';
import SemanticLayerErdModelNode from './SemanticLayerErdModelNode';
import JoinOperatorPopover from './JoinOperatorPopover';

/**
 * SemanticLayerCanvas — the project-wide Semantic Layer ERD (VIS-1014).
 *
 * Reuses the RelationErdCanvas harness (the `useRelationErdDag` graph builder +
 * the JoinOperatorPopover author flow) but, instead of scoping to one relation,
 * shows EVERY model with its fields:
 *   - columns (hydrated via useModelColumns, with per-column connection handles);
 *   - metrics (cyan pills) and dimensions (teal pills), grouped onto each card by
 *     semanticFields.groupFieldsByModel;
 *   - every relation as an edge between the two joined columns.
 *
 * Users author a NEW relation by dragging column→column → the JoinOperatorPopover
 * persists it via relationStore.saveRelation, exactly as the Relation ERD does.
 *
 * Inline metric/dimension EDITING is deferred (v1): the page is the read +
 * relate surface; field rows deep-link to their per-object editor through the
 * project governance lists, and creating relations is fully supported here.
 *
 * data-testid: `semantic-layer-erd`.
 */
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

const SemanticLayerCanvas = () => {
  const fetchModels = useStore(s => s.fetchModels);
  const fetchRelations = useStore(s => s.fetchRelations);
  const fetchMetrics = useStore(s => s.fetchMetrics);
  const fetchDimensions = useStore(s => s.fetchDimensions);
  const models = useStore(s => s.models);
  const metrics = useStore(s => s.metrics);
  const dimensions = useStore(s => s.dimensions);

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

  // Build the base graph (all models + relation edges + hydrated columns).
  const { nodes: baseNodes, edges } = useRelationErdDag({
    scopeAll: true,
    columnsByModel,
  });

  // Fold each model's metrics + dimensions onto its node so the card can render
  // the field pill sections.
  const fieldsByModel = useMemo(
    () => groupFieldsByModel(models || [], metrics || [], dimensions || []),
    [models, metrics, dimensions]
  );

  const nodes = useMemo(
    () =>
      baseNodes.map(node => {
        const fields = fieldsByModel[node.data.name] || { metrics: [], dimensions: [] };
        return {
          ...node,
          type: 'semanticLayerModelNode',
          data: { ...node.data, metrics: fields.metrics, dimensions: fields.dimensions },
        };
      }),
    [baseNodes, fieldsByModel]
  );

  const nodeTypes = useMemo(() => ({ semanticLayerModelNode: SemanticLayerErdModelNode }), []);

  // Author-a-relation flow (mirrors RelationErdCanvas).
  const connectStartRef = useRef(null);
  const [popover, setPopover] = useState(null);

  const modelNameForNode = useCallback(
    nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return node?.data?.name || null;
    },
    [nodes]
  );

  const onConnectStart = useCallback((_event, params) => {
    connectStartRef.current = params;
  }, []);

  const isValidConnection = useCallback(
    connection => connection.source !== connection.target,
    []
  );

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

  const hasModels = nodes.length > 0;

  return (
    <div data-testid="semantic-layer-erd" className="relative flex h-full w-full flex-col">
      {!hasModels ? (
        <EmptyState />
      ) : (
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onConnectStart={onConnectStart}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            minZoom={0.1}
            maxZoom={2}
            fitView
            style={{ background: '#f8fafc' }}
            defaultEdgeOptions={{ animated: true }}
          >
            <Background color="#e2e8f0" gap={16} />
            <Controls />
            <MiniMap style={{ background: '#f1f5f9' }} />
          </ReactFlow>
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

export default SemanticLayerCanvas;
