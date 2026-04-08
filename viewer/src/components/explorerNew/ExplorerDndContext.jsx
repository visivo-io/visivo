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

        // Check if the drop target's RefTextArea has an active cursor
        const dropEl = document.querySelector(
          dropData.type === 'axis-zone'
            ? `[data-testid="droppable-property-${fieldName}"]`
            : `[data-testid="droppable-property-${dropData.path}"]`
        );
        const hasCursor = dropEl?.querySelector('[data-has-cursor="true"]');
        if (hasCursor && activeInsightName) {
          // Insert at cursor position
          hasCursor.dispatchEvent(new CustomEvent('ref-insert-at-cursor', {
            detail: { refExpr },
            bubbles: false,
          }));
        } else if (activeInsightName) {
          // Replace entire value
          setInsightProp(activeInsightName, fieldName, '?{' + refExpr + '}');
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

        // Check if the interaction field's RefTextArea has an active cursor
        const dropEl = document.querySelector(
          `[data-testid="interaction-value-field-${index}"]`
        );
        const hasCursor = dropEl?.querySelector('[data-has-cursor="true"]');
        if (hasCursor) {
          // Insert at cursor position — RefTextArea handles ?{} wrapping via onChange
          hasCursor.dispatchEvent(new CustomEvent('ref-insert-at-cursor', {
            detail: { refExpr },
            bubbles: false,
          }));
        } else {
          // No cursor — replace entire value
          updateInsightInteraction(insightName, index, { value: `?{${refExpr}}` });
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
