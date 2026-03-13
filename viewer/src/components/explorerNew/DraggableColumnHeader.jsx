import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import DataTableHeader from '../common/DataTableHeader';

const COMPUTED_STYLES = {
  metric: 'border-t-2 border-t-cyan-500 bg-cyan-50/50',
  dimension: 'border-t-2 border-t-teal-500 bg-teal-50/50',
};

const DraggableColumnHeader = ({ column, sorting, onSortChange, onInfoClick }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `column-${column.name}`,
    data: { name: column.name, type: 'column', sourceType: 'data-table' },
  });

  const computedStyle = column.computedType ? COMPUTED_STYLES[column.computedType] || '' : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''} ${computedStyle}`}
      data-testid={`draggable-col-${column.name}`}
    >
      <DataTableHeader
        column={column}
        sorting={sorting}
        onSortChange={onSortChange}
        onInfoClick={onInfoClick}
      />
    </div>
  );
};

export default React.memo(DraggableColumnHeader);
