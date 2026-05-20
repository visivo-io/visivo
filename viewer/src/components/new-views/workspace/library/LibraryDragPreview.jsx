import React from 'react';
import { getTypeDef } from './LibraryRow';

/**
 * LibraryDragPreview — VIS-776 / Track C C3.
 *
 * The "pill" rendered inside the workspace's `<DragOverlay>` when a row is
 * being dragged out of the Library. Mirrors the `dragPreview` block in the
 * C-1 `library.jsx` blueprint and the C-1 design notes' drag-preview pill:
 *
 *   white card + mulberry ring + small type icon + name + uppercase type chip
 *
 * Track D wires up the parent `<DndContext>` + `<DragOverlay>` on the
 * canvas; this component just renders the pill from the drag's `active.data`
 * payload (`{ source: 'library', type, name }`).
 */
const LibraryDragPreview = ({ data }) => {
  if (!data || data.source !== 'library') return null;
  const { type, name } = data;
  const def = getTypeDef(type);
  const Icon = def.icon;

  return (
    <div
      data-testid="library-drag-preview"
      className="pointer-events-none inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 shadow-lg ring-1 ring-[#713b57]"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 text-[#713b57]" />
      <span className="text-[13px] font-medium text-gray-900">{name}</span>
      <span className="ml-1 inline-flex h-4 items-center rounded-sm bg-[#e2d7dd] px-1 text-[10px] font-bold uppercase tracking-wide text-[#5a2f45]">
        {def.label}
      </span>
    </div>
  );
};

export default LibraryDragPreview;
