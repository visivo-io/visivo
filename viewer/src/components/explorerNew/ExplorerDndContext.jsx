import React, { useCallback, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { PiColumns, PiChartBar, PiFunction } from 'react-icons/pi';
import useStore from '../../stores/store';

const TYPE_ICONS = {
  column: PiColumns,
  metric: PiChartBar,
  dimension: PiFunction,
};

const TYPE_COLORS = {
  column: 'bg-secondary-100 text-secondary-800 border-secondary-300',
  metric: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  dimension: 'bg-teal-100 text-teal-800 border-teal-300',
};

const DragOverlayContent = ({ data }) => {
  if (!data) return null;
  const Icon = TYPE_ICONS[data.type] || PiColumns;
  const colorClass = TYPE_COLORS[data.type] || TYPE_COLORS.column;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shadow-lg ${colorClass}`}
      data-testid="drag-overlay"
    >
      <Icon size={12} />
      {data.name}
    </div>
  );
};

const ExplorerDndContext = ({ children }) => {
  const setInsightProp = useStore((s) => s.setExplorerInsightProp);
  const addComputedColumn = useStore((s) => s.addExplorerComputedColumn);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
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
        if (dragData.type === 'column') {
          value = activeModelName
            ? '?{${ref(' + activeModelName + ').' + dragData.name + '}}'
            : '?{' + dragData.name + '}';
        } else {
          value = '?{${ref(' + dragData.name + ')}}';
        }
        setInsightProp(fieldName, value);
      } else if (dropData?.type === 'data-table-drop') {
        if (dragData.type === 'metric' || dragData.type === 'dimension') {
          addComputedColumn({
            name: dragData.name,
            expression: dragData.expression || dragData.name,
            type: dragData.type,
          });
        }
      }
    },
    [setInsightProp, addComputedColumn, activeModelName]
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
