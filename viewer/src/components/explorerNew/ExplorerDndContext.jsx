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
  insight: 'bg-purple-100 text-purple-800 border-purple-300',
};

const DragOverlayContent = ({ data }) => {
  if (!data) return null;
  const Icon = TYPE_ICONS[data.type] || PiColumns;
  const colorClass = TYPE_COLORS[data.type] || TYPE_COLORS.column;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border shadow-lg ${colorClass}`}
      data-testid="drag-overlay"
    >
      <Icon size={12} />
      {data.name}
    </div>
  );
};

const ExplorerDndContext = ({ children }) => {
  const activeModelName = useStore((s) => s.explorerActiveModelName) || 'preview_model';
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const setInsightProp = useStore((s) => s.setInsightProp);
  const addComputedColumn = useStore((s) => s.addActiveModelComputedColumn);
  const setActiveModelSource = useStore((s) => s.setActiveModelSource);

  // Backward-compat shims for components not yet migrated
  const setExplorerInsightProp = useStore((s) => s.setExplorerInsightProp);
  const addExplorerComputedColumn = useStore((s) => s.addExplorerComputedColumn);

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
        const value = '?{${ref(' + activeModelName + ').' + dragData.name + '}}';

        // Update both new multi-insight store and backward-compat shim
        if (activeInsightName) {
          setInsightProp(activeInsightName, fieldName, value);
        }
        setExplorerInsightProp(fieldName, value);
      } else if (dropData?.type === 'data-table-drop') {
        if (dragData.type === 'metric' || dragData.type === 'dimension') {
          addComputedColumn({
            name: dragData.name,
            expression: dragData.expression || dragData.name,
            type: dragData.type,
          });
          addExplorerComputedColumn({
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
      setExplorerInsightProp,
      addComputedColumn,
      addExplorerComputedColumn,
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
