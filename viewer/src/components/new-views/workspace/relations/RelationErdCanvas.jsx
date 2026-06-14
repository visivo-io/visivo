import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import useStore from '../../../../stores/store';
import { useObjectCanvasDirty } from '../ObjectCanvasFrame';
import { useRelationErdDag } from './useRelationErdDag';
import ErdModelNode from './ErdModelNode';
import JoinOperatorPopover from './JoinOperatorPopover';

/**
 * RelationErdCanvas — the Relations ERD builder (VIS-1006).
 *
 * A React-Flow canvas (cloned from the lineage harness) that:
 *   - renders every project model as a column-listing card (ErdModelNode);
 *   - draws every existing relation as an edge between the two joined columns;
 *   - lets you AUTHOR a relation by dragging from one card's column handle to
 *     another's — onConnect(End) opens the JoinOperatorPopover pre-filled with
 *     the dragged endpoints, which (on save) writes the relation via the store.
 *
 * Mounted as the Relation type's Canvas lens body by ObjectCanvasFrame, so it
 * receives `{ activeObject, projectId, record, lens }` (it reads its data from
 * the store, so those are advisory).
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

const RelationErdCanvas = () => {
  const fetchModels = useStore(s => s.fetchModels);
  const fetchRelations = useStore(s => s.fetchRelations);
  const models = useStore(s => s.models);
  const { setDirty } = useObjectCanvasDirty();

  // Hydrate the two collections the ERD reads from.
  useEffect(() => {
    if ((!models || models.length === 0) && typeof fetchModels === 'function') fetchModels();
    if (typeof fetchRelations === 'function') fetchRelations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { nodes, edges } = useRelationErdDag();

  const nodeTypes = useMemo(() => ({ erdModelNode: ErdModelNode }), []);

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

  return (
    <div data-testid="relation-erd" className="relative flex h-full w-full flex-col">
      {(!models || models.length === 0) ? (
        <ErdEmptyState />
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

export default RelationErdCanvas;
