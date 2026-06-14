import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import { useDroppable } from '@dnd-kit/core';
import 'reactflow/dist/style.css';
import useStore from '../../../../stores/store';
import { useObjectCanvasDirty } from '../ObjectCanvasFrame';
import { useRelationErdDag, relationModelNames } from './useRelationErdDag';
import { useModelColumns } from './useModelColumns';
import ErdModelNode from './ErdModelNode';
import JoinOperatorPopover from './JoinOperatorPopover';
import AddModelMention from './AddModelMention';

/**
 * RelationErdCanvas — the Relations ERD builder (VIS-1006).
 *
 * A React-Flow canvas (cloned from the lineage harness) that:
 *   - renders the relation's OWN models as column-listing cards (ErdModelNode),
 *     each card listing the model's REAL columns (hydrated via useModelColumns);
 *   - draws every existing relation as an edge between the two joined columns;
 *   - lets you SCOPE to a single relation's models, then ADD more models to the
 *     canvas (drag a Library model row, or @-mention search) to author a NEW
 *     relation by dragging column→column — onConnect(End) opens the
 *     JoinOperatorPopover pre-filled with the dragged endpoints.
 *
 * Mounted as the Relation type's Canvas lens body by ObjectCanvasFrame, so it
 * receives `{ activeObject, projectId, record, lens }` (it reads its data from
 * the store, so those are advisory). When the active object is a specific
 * relation, the ERD is SCOPED to that relation's two models (plus any the user
 * adds). When no relation is active (e.g. the Semantic Layer page reuses this
 * harness with `scopeAll`), it shows every model.
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

/**
 * @param {object} props
 * @param {object} [props.activeObject] the active workspace object (advisory). When
 *   `{ type: 'relation', name }` the ERD scopes to that relation's models.
 * @param {boolean} [props.scopeAll] force show-all-models (the Semantic Layer
 *   page passes this to reuse the harness as a project-wide ERD).
 */
const RelationErdCanvas = ({ activeObject = null, scopeAll = false }) => {
  const fetchModels = useStore(s => s.fetchModels);
  const fetchRelations = useStore(s => s.fetchRelations);
  const models = useStore(s => s.models);
  const relations = useStore(s => s.relations);
  const storeActiveObject = useStore(s => s.workspaceActiveObject);
  const { setDirty } = useObjectCanvasDirty();

  // Models the user has added to the canvas on top of the scoped set (via the
  // @-mention picker or a Library model drop).
  const [extraModelNames, setExtraModelNames] = useState([]);

  // Hydrate the two collections the ERD reads from.
  useEffect(() => {
    if ((!models || models.length === 0) && typeof fetchModels === 'function') fetchModels();
    if (typeof fetchRelations === 'function') fetchRelations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the active relation. Prefer the explicit prop, fall back to the
  // store's active object (so this works whether the frame passes it or not).
  const active = activeObject || storeActiveObject;
  const activeRelationName =
    !scopeAll && active?.type === 'relation' ? active.name : null;

  // The scoped model set for a single relation: parse its condition for the two
  // joined model names (ref parsing via the shared helper — NOT SQL parsing).
  const scopeModelNames = useMemo(() => {
    if (scopeAll || !activeRelationName) return null; // null → show all models
    const relation = (relations || []).find(r => r.name === activeRelationName);
    const names = relationModelNames(relation);
    return names.length > 0 ? names : null;
  }, [scopeAll, activeRelationName, relations]);

  // Reset the user-added models whenever the scope (relation / scopeAll) changes
  // so a previous relation's additions don't bleed into another's canvas.
  useEffect(() => {
    setExtraModelNames([]);
  }, [activeRelationName, scopeAll]);

  // The models actually on the canvas (scoped + extras) — drives both the column
  // hydration and the @-mention exclude list.
  const visibleModelNames = useMemo(() => {
    if (!scopeModelNames) return (models || []).map(m => m.name);
    return [...new Set([...scopeModelNames, ...extraModelNames])];
  }, [scopeModelNames, extraModelNames, models]);

  const { columnsByModel } = useModelColumns(visibleModelNames);

  const { nodes, edges } = useRelationErdDag({
    scopeModelNames,
    extraModelNames,
    columnsByModel,
  });

  const nodeTypes = useMemo(() => ({ erdModelNode: ErdModelNode }), []);

  // A canvas-wide droppable so a Library model row dropped anywhere on the ERD
  // is added to the scoped set. The shell's single WorkspaceDndContext routes
  // the drop (see its onDragEnd model-drop branch) to `onAddModel` via this
  // zone's data payload.
  const addModelToCanvas = useCallback(name => {
    if (!name) return;
    setExtraModelNames(prev => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const { setNodeRef: setDropRef } = useDroppable({
    id: 'relation-erd-canvas-drop',
    data: { kind: 'erd-canvas', onAddModel: addModelToCanvas },
  });

  // The in-flight drag's start endpoint, captured on onConnectStart so we can
  // build the popover's "From" side even if the drop lands on empty canvas.
  const connectStartRef = useRef(null);
  const [popover, setPopover] = useState(null); // { x, y, initialA, initialB }

  // Map a reactflow node id back to its model name (id = `erd-model-<name>`).
  const modelNameForNode = useCallback(
    nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return node?.data?.name || null;
    },
    [nodes]
  );

  const onConnectStart = useCallback((_event, params) => {
    connectStartRef.current = params; // { nodeId, handleId, handleType }
  }, []);

  // Reject same-model self-joins; everything else (column→column across models)
  // is a candidate the popover will let the user refine.
  const isValidConnection = useCallback(
    connection => connection.source !== connection.target,
    []
  );

  // A completed column→column drag: open the popover pre-filled with both ends.
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

  // A drag that ends on empty canvas still opens the popover with the "From"
  // side filled, so authoring isn't lost on a near-miss drop.
  const onConnectEnd = useCallback(
    event => {
      const start = connectStartRef.current;
      connectStartRef.current = null;
      const targetIsPane =
        event?.target?.classList?.contains?.('react-flow__pane') ?? false;
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

  // Mark the canvas dirty while the author popover is open (an unsaved draft).
  useEffect(() => {
    if (setDirty) setDirty(Boolean(popover));
  }, [popover, setDirty]);

  const hasModels = nodes.length > 0;

  return (
    <div data-testid="relation-erd" className="relative flex h-full w-full flex-col">
      {/* Canvas toolbar: @-mention search to add a model to the ERD (VIS-1006b). */}
      <div
        data-testid="relation-erd-toolbar"
        className="absolute left-3 top-3 z-10 flex items-center gap-2"
      >
        <AddModelMention
          models={models || []}
          excludeNames={visibleModelNames}
          onAdd={addModelToCanvas}
          testId="relation-erd-add-model"
        />
        {scopeModelNames && (
          <span className="rounded-md bg-white/80 px-2 py-1 text-[11px] text-gray-500 shadow-sm">
            Scoped to this relation
          </span>
        )}
      </div>

      {!hasModels ? (
        <ErdEmptyState />
      ) : (
        <div ref={setDropRef} data-testid="relation-erd-dropzone" className="relative flex-1">
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

export default RelationErdCanvas;
