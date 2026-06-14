import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { getTypeColors } from '../../common/objectTypeConfigs';

/**
 * PivotFieldList — VIS-1008.
 *
 * The LEFT pane of the pivot playground: the table's available source fields as
 * draggable pills. Each pill registers with the shell's ONE shared dnd-kit
 * context (WorkspaceDndContext) via `useDraggable`, carrying
 * `{ source: 'pivot-field', field }` so the context's `pivot-field` router
 * branch can hand the field to whichever shelf it lands on.
 *
 * Fields are resolved upstream by `usePivotPlaygroundFields` and passed in as
 * `{ name, label, source }` descriptors.
 */

const FieldPill = ({ field }) => {
  const colors = getTypeColors('dimension');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pivot-field:${field.source || ''}:${field.name}`,
    data: { source: 'pivot-field', field },
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`pivot-field-${field.name}`}
      title={`Drag "${field.label}" onto a shelf`}
      className={[
        'flex w-full cursor-grab items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors',
        colors.border,
        colors.bg,
        colors.text,
        isDragging ? 'opacity-40' : 'hover:brightness-95',
      ].join(' ')}
    >
      <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" className="shrink-0 opacity-60">
        <g fill="currentColor">
          <circle cx="3" cy="3" r="1.3" />
          <circle cx="3" cy="7" r="1.3" />
          <circle cx="3" cy="11" r="1.3" />
          <circle cx="8" cy="3" r="1.3" />
          <circle cx="8" cy="7" r="1.3" />
          <circle cx="8" cy="11" r="1.3" />
        </g>
      </svg>
      <span className="truncate">{field.label}</span>
    </button>
  );
};

const PivotFieldList = ({ fields = [], isLoading = false }) => {
  return (
    <div
      data-testid="pivot-field-list"
      className="flex min-h-0 w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Fields
        </span>
        <span className="text-[11px] text-gray-400">drag onto a shelf</span>
      </div>
      <div className="flex-1 min-h-0 space-y-1.5 overflow-auto p-2.5">
        {fields.length === 0 ? (
          <p className="px-1 py-4 text-center text-[12px] text-gray-400">
            {isLoading ? 'Loading fields…' : 'No fields available for this table.'}
          </p>
        ) : (
          fields.map(field => <FieldPill key={field.name} field={field} />)
        )}
      </div>
    </div>
  );
};

export default PivotFieldList;
