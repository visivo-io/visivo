import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import DataTableHeader from '../common/DataTableHeader';

const DraggableColumnHeader = ({ column, sorting, onSortChange, onInfoClick }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `column-${column.name}`,
    data: { name: column.name, type: 'column', sourceType: 'data-table' },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${isDragging ? 'opacity-50' : ''}`}
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
