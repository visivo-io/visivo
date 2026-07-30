import React from 'react';
import { useDraggable } from '@dnd-kit/core';

/**
 * DraggableTh — the ONE draggable results-column source (Phase 4b Step 3).
 *
 * Both results grids drag columns into insight property/interaction zones:
 * the Explorer grid (via `DraggableColumnHeader`, wrapping the rich
 * `DataTableHeader`) and the Workspace `ModelPreview` grid (a plain column
 * cell). They used to diverge — only the Explorer grid was draggable, so a
 * column in ModelPreview couldn't be dropped onto an insight at all. This
 * primitive owns the dnd-kit wiring + drag-affordance styling once so the two
 * can't drift again.
 *
 * Emits `{ name, type: 'column', sourceType }`. Every `WorkspaceDndContext`
 * route keys on `type: 'column'` (never the specific `sourceType`) and
 * resolves the ref against the DROP-TIME active model, so a column dragged
 * from either grid lands identically. `sourceType` only namespaces the
 * dnd-kit id (so both grids can be mounted without an id collision) and lets
 * the DragOverlay/analytics tell the two sources apart.
 *
 * `as` picks the rendered element: 'div' for the Explorer HeaderComponent
 * (slotted inside the DataTable's own <th>, so it must NOT be a <th>), 'th'
 * for the ModelPreview header cell.
 */
const DraggableTh = ({
  name,
  sourceType,
  as: Element = 'th',
  className = '',
  style,
  title,
  dataTestId,
  children,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${sourceType}-column-${name}`,
    data: { name, type: 'column', sourceType },
  });

  return (
    <Element
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''} ${className}`}
      style={style}
      data-testid={dataTestId}
      title={title}
    >
      {children}
    </Element>
  );
};

export default React.memo(DraggableTh);
