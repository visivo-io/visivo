import React, { useCallback, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import useStore from '../../stores/store';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';
import { formatRefExpression } from '../../utils/refString';

const DragOverlayContent = ({ data }) => {
  if (!data) return null;
  return (
    <EmbeddedPill
      objectType={data.type || 'model'}
      label={data.name}
      size="md"
      as="div"
    />
  );
};

const ExplorerDndContext = ({ children }) => {
  const activeModelName = useStore((s) => s.explorerActiveModelName) || 'preview_model';
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const setInsightProp = useStore((s) => s.setInsightProp);
  const addComputedColumn = useStore((s) => s.addActiveModelComputedColumn);
  const setActiveModelSource = useStore((s) => s.setActiveModelSource);
  const updateInsightInteraction = useStore((s) => s.updateInsightInteraction);

  const [activeData, setActiveData] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event) => {
    setActiveData(event.active.data.current || null);
  }, []);

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      setActiveData(null);

      if (!over || !active.data.current) return;

      const dragData = active.data.current;
      const dropData = over.data.current;

      if (dropData?.type === 'axis-zone' || dropData?.type === 'property-zone') {
        const fieldName = dropData.type === 'axis-zone' ? dropData.fieldName : dropData.path;

        let value;
        if (dragData.type === 'metric' || dragData.type === 'dimension') {
          if (dragData.parentModel) {
            value = '?{' + formatRefExpression(dragData.parentModel, dragData.name) + '}';
          } else {
            value = '?{' + formatRefExpression(dragData.name) + '}';
          }
        } else if (dragData.type === 'input') {
          const accessor = dragData.inputType === 'multi-select' ? 'values' : 'value';
          value = '?{' + formatRefExpression(dragData.name, accessor) + '}';
        } else {
          value = '?{' + formatRefExpression(activeModelName, dragData.name) + '}';
        }

        if (activeInsightName) {
          setInsightProp(activeInsightName, fieldName, value);
        }
      } else if (dropData?.type === 'data-table-drop') {
        if (dragData.type === 'metric' || dragData.type === 'dimension') {
          addComputedColumn({
            name: dragData.name,
            expression: dragData.expression || dragData.name,
            type: dragData.type,
          });
        }
      } else if (dropData?.type === 'interaction-zone') {
        const { insightName, index } = dropData;
        if (!insightName) return;

        // Build ref expression (without ?{} — the interaction handler adds it)
        let refExpr;
        if (dragData.type === 'metric' || dragData.type === 'dimension') {
          refExpr = dragData.parentModel
            ? formatRefExpression(dragData.parentModel, dragData.name)
            : formatRefExpression(dragData.name);
        } else if (dragData.type === 'input') {
          const accessor = dragData.inputType === 'multi-select' ? 'values' : 'value';
          refExpr = formatRefExpression(dragData.name, accessor);
        } else {
          refExpr = formatRefExpression(activeModelName, dragData.name);
        }

        // Get current value, strip ?{}, append ref, re-wrap
        const state = useStore.getState();
        const insight = state.explorerInsightStates[insightName];
        if (insight) {
          const currentValue = insight.interactions[index]?.value || '';
          const inner = currentValue.match(/^\?\{([\s\S]*)\}$/)?.[1] || currentValue;
          const newInner = inner ? `${inner} ${refExpr}` : refExpr;
          updateInsightInteraction(insightName, index, { value: `?{${newInner}}` });
        }
      } else if (dropData?.type === 'source-zone') {
        if (dragData.type === 'source') {
          setActiveModelSource(dragData.name);
        }
      }
    },
    [
      activeModelName,
      activeInsightName,
      setInsightProp,
      addComputedColumn,
      setActiveModelSource,
      updateInsightInteraction,
    ]
  );

  const handleDragCancel = useCallback(() => {
    setActiveData(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeData && <DragOverlayContent data={activeData} />}
      </DragOverlay>
    </DndContext>
  );
};

export default ExplorerDndContext;
