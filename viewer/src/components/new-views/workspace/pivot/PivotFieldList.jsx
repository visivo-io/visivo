import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import FieldPill from '../../common/FieldPill';

/**
 * PivotFieldList — VIS-1008.
 *
 * The LEFT pane of the pivot playground: the table's available source fields as
 * draggable pills. Each pill registers with the shell's ONE shared dnd-kit
 * context (WorkspaceDndContext) via `useDraggable`, carrying
 * `{ source: 'pivot-field', field }` so the context's `pivot-field` router
 * branch can hand the field to whichever shelf it lands on.
 *
 * Pivot fields are a table's data columns, so they render with the app's shared
 * `FieldPill` (icon + colors from objectTypeConfigs, the SAME look used for the
 * model preview's Semantic Fields strip) — typed `dimension` since they are the
 * dimensional columns you drag onto Columns / Rows / Values.
 *
 * Fields are resolved upstream by `usePivotPlaygroundFields` and passed in as
 * `{ name, label, source }` descriptors.
 */

const PivotField = ({ field }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pivot-field:${field.source || ''}:${field.name}`,
    data: { source: 'pivot-field', field },
  });

  return (
    <FieldPill
      as="button"
      type="dimension"
      name={field.name}
      label={field.label}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`pivot-field-${field.name}`}
      title={`Drag "${field.label}" onto a shelf`}
      className={`w-full cursor-grab justify-start ${isDragging ? 'opacity-40' : 'hover:brightness-95'}`}
    />
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
          fields.map(field => <PivotField key={field.name} field={field} />)
        )}
      </div>
    </div>
  );
};

export default PivotFieldList;
