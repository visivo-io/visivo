import React, { useCallback, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
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
            // Model-scoped metric/dimension: ?{${ref(parentModel).name}}
            value = '?{' + formatRefExpression(dragData.parentModel, dragData.name) + '}';
          } else {
            // Global/standalone metric/dimension: ?{${ref(name)}}
            value = '?{' + formatRefExpression(dragData.name) + '}';
          }
        } else {
          // Columns (implicit dimensions from data table): ?{${ref(activeModel).column}}
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
    ]
  );

  const handleDragCancel = useCallback(() => {
    setActiveData(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
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
