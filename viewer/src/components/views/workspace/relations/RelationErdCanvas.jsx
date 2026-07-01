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
import { useDroppable } from '@dnd-kit/core';
import 'reactflow/dist/style.css';
import useStore from '../../../../stores/store';
import { useObjectCanvasDirty } from '../ObjectCanvasFrame';
import { useRelationErdDag, relationModelNames } from './useRelationErdDag';
import { useModelColumns } from './useModelColumns';
import ErdModelNode from './ErdModelNode';
import RelationNode from './RelationNode';
import JoinOperatorPopover from './JoinOperatorPopover';
import AddModelMention from './AddModelMention';
import RelationLinkEdge from './RelationLinkEdge';
import { mergeById } from './erdNodeMerge';
import ErdTidyButton from './ErdTidyButton';

/**
 * RelationErdCanvas — the Relations ERD builder (VIS-1006).
 *
 * Wrapped in a ReactFlowProvider (the custom edge + pill require it). Controlled
 * draggable nodes with per-scope session persistence + a Tidy action. scopeKey =
 * 'relation:'+activeRelationName (or 'relation:__all__' for scopeAll).
 *
 * data-testid: `relation-erd`.
 */
const ErdEmptyState = () => (
  <div
    data-testid="relation-erd-empty"
    className="flex flex-1 items-center justify-center bg-gray-50 p-12 text-center"
  >
    <div className="max-w-[360px] rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-[15px] font-semibold text-gray-900">No models to relate yet</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
        Add at least two models, then drag a column from one card onto a column of another to
        author a relation.
      </p>
    </div>
  </div>
);

const RelationErdCanvasInner = ({ activeObject = null, scopeAll = false }) => {
  const fetchModels = useStore(s => s.fetchModels);
  const fetchRelations = useStore(s => s.fetchRelations);
  const models = useStore(s => s.models);
  const relations = useStore(s => s.relations);
  const storeActiveObject = useStore(s => s.workspaceActiveObject);
  const openEditRelationModal = useStore(s => s.openEditRelationModal);
  const getRelationByName = useStore(s => s.getRelationByName);
  const { setDirty } = useObjectCanvasDirty();

  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  // Models the user added on top of the scoped set (@-mention / Library drop).
  const [extraModelNames, setExtraModelNames] = useState([]);

  useEffect(() => {
    if ((!models || models.length === 0) && typeof fetchModels === 'function') fetchModels();
    if (typeof fetchRelations === 'function') fetchRelations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = activeObject || storeActiveObject;
  const activeRelationName = !scopeAll && active?.type === 'relation' ? active.name : null;

  // Per-scope session key: one relation, the scopeAll overview, or unscoped.
  const scopeKey = scopeAll
    ? 'relation:__all__'
    : activeRelationName
      ? `relation:${activeRelationName}`
      : 'relation:__all__';

  const scopeModelNames = useMemo(() => {
    if (scopeAll || !activeRelationName) return null;
    const relation = (relations || []).find(r => r.name === activeRelationName);
    const names = relationModelNames(relation);
    return names.length > 0 ? names : null;
  }, [scopeAll, activeRelationName, relations]);

  useEffect(() => {
    setExtraModelNames([]);
  }, [activeRelationName, scopeAll]);

  const visibleModelNames = useMemo(() => {
    if (!scopeModelNames) return (models || []).map(m => m.name);
    return [...new Set([...scopeModelNames, ...extraModelNames])];
  }, [scopeModelNames, extraModelNames, models]);

  const { columnsByModel } = useModelColumns(visibleModelNames);

  // Session-persisted layout for this scope.
  const erdLayout = useStore(s => s.getErdLayout(scopeKey));
  const layoutVersion = useStore(s => s.workspaceErdLayoutVersion[scopeKey] || 0);
  const setErdNodePositions = useStore(s => s.setErdNodePositions);
  const clearErdLayout = useStore(s => s.clearErdLayout);
  const savedPositions = erdLayout.nodes;

  const { nodes: seededNodes, edges } = useRelationErdDag({
    scopeModelNames,
    extraModelNames,
    columnsByModel,
    savedPositions,
    layoutVersion,
  });

  const nodeTypes = useMemo(
    () => ({ erdModelNode: ErdModelNode, relationNode: RelationNode }),
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

  // Controlled draggable nodes (mergeById §6). Reseed when the hook output, scope,
  // or layoutVersion changes.
  const [rfNodes, setRfNodes] = useState([]);
  useEffect(() => {
    setRfNodes(prev => mergeById(prev, seededNodes, savedPositions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededNodes, scopeKey, layoutVersion]);

  const onNodesChange = useCallback(
    changes => setRfNodes(ns => applyNodeChanges(changes, ns)),
    []
  );
  const onNodeDragStop = useCallback(
    (_event, node) => {
      if (node && setErdNodePositions) {
        setErdNodePositions(scopeKey, { [node.id]: node.position });
      }
    },
    [setErdNodePositions, scopeKey]
  );

  // Imperative fit on mount (and on Tidy / scope change) — never after a drag-stop.
  // Wait for `nodesInitialized` so fitView frames measured cards, not a no-op on
  // unmeasured nodes.
  const fittedScopeRef = useRef(null);
  useEffect(() => {
    if (nodesInitialized && fittedScopeRef.current !== scopeKey && rfNodes.length > 0) {
      fittedScopeRef.current = scopeKey;
      fitView({ padding: 0.2, maxZoom: 1.2 });
    }
  }, [nodesInitialized, scopeKey, rfNodes.length, fitView]);

  const handleTidy = useCallback(() => {
    if (clearErdLayout) clearErdLayout(scopeKey);
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.2 }), 0);
  }, [clearErdLayout, fitView, scopeKey]);

  const hasEdits = Object.keys(savedPositions || {}).length > 0;

  // Canvas-wide droppable (Library model drop adds a model to the scope).
  const addModelToCanvas = useCallback(name => {
    if (!name) return;
    setExtraModelNames(prev => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const { setNodeRef: setDropRef } = useDroppable({
    id: 'relation-erd-canvas-drop',
    data: { kind: 'erd-canvas', onAddModel: addModelToCanvas },
  });

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

  const handlePopoverSaved = useCallback(() => {
    setDirty && setDirty(false);
    if (typeof fetchRelations === 'function') fetchRelations();
  }, [fetchRelations, setDirty]);

  const closePopover = useCallback(() => setPopover(null), []);

  useEffect(() => {
    if (setDirty) setDirty(Boolean(popover));
  }, [popover, setDirty]);

  const hasModels = seededNodes.length > 0;

  return (
    <div data-testid="relation-erd" className="relative flex h-full w-full flex-col">
      {/* Canvas toolbar (in-flow header row so it never overlaps a card):
          @-mention add-model + scope chip on the left, Tidy layout on the right. */}
      <div
        data-testid="relation-erd-toolbar"
        className="flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 py-1.5"
      >
        <div className="flex items-center gap-2">
          <AddModelMention
            models={models || []}
            excludeNames={visibleModelNames}
            onAdd={addModelToCanvas}
            testId="relation-erd-add-model"
          />
          {scopeModelNames && (
            <span className="rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
              Scoped to this relation
            </span>
          )}
        </div>
        <ErdTidyButton onTidy={handleTidy} hasEdits={hasEdits} testId="relation-erd-reset-layout" />
      </div>

      {!hasModels ? (
        <ErdEmptyState />
      ) : (
        <div ref={setDropRef} data-testid="relation-erd-dropzone" className="relative flex-1">
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

const RelationErdCanvas = props => (
  <ReactFlowProvider>
    <RelationErdCanvasInner {...props} />
  </ReactFlowProvider>
);

export default RelationErdCanvas;
