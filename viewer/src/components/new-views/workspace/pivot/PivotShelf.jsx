import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { getTypeColors } from '../../common/objectTypeConfigs';

/**
 * PivotShelf — VIS-1008.
 *
 * One of the three drop targets in the pivot playground's MIDDLE pane:
 * `columns`, `rows`, or `values`. Registers a `useDroppable` with the shell's
 * shared dnd-kit context (WorkspaceDndContext) carrying
 * `{ kind: 'pivot-field', shelf, onDropField }`; the context's `pivot-field`
 * router branch invokes `onDropField(field)` when a field pill lands here, and
 * the playground appends a chip to this shelf's draft array.
 *
 * Chips on the `values` shelf each carry an aggregation `<select>`
 * (sum / avg / min / max / count / count_distinct); the playground re-serialises
 * the chosen aggregation into the value expression and re-runs the live result.
 */

export const AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'];

const AGG_LABELS = {
  sum: 'Sum',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
  count: 'Count',
  count_distinct: 'Count distinct',
};

const SHELF_META = {
  columns: { label: 'Columns', hint: 'one chip per column field' },
  rows: { label: 'Rows', hint: 'one chip per row field' },
  values: { label: 'Values', hint: 'aggregated measures' },
};

const Chip = ({ shelf, chip, index, colors, onRemove, onAggChange }) => (
  <div
    data-testid={`pivot-chip-${shelf}-${index}`}
    className={[
      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium',
      colors.border,
      colors.bg,
      colors.text,
    ].join(' ')}
  >
    <span className="truncate" title={chip.label}>
      {chip.label}
    </span>
    {shelf === 'values' && (
      <select
        data-testid={`pivot-chip-${shelf}-${index}-agg`}
        aria-label={`Aggregation for ${chip.label}`}
        value={chip.agg}
        onChange={e => onAggChange(index, e.target.value)}
        className="rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-300"
      >
        {AGGREGATIONS.map(agg => (
          <option key={agg} value={agg}>
            {AGG_LABELS[agg]}
          </option>
        ))}
      </select>
    )}
    <button
      type="button"
      aria-label={`Remove ${chip.label}`}
      data-testid={`pivot-chip-${shelf}-${index}-remove`}
      onClick={() => onRemove(index)}
      className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-white/60 hover:text-gray-700"
    >
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
        <path
          d="M1 1l8 8M9 1l-8 8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  </div>
);

const PivotShelf = ({ shelf, chips = [], onDropField, onRemoveChip, onAggChange }) => {
  const meta = SHELF_META[shelf] || { label: shelf, hint: '' };
  const colors = getTypeColors(shelf === 'values' ? 'metric' : 'dimension');

  const { setNodeRef, isOver } = useDroppable({
    id: `pivot-shelf-${shelf}`,
    data: { kind: 'pivot-field', shelf, onDropField },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`pivot-shelf-${shelf}`}
      data-over={isOver ? 'true' : 'false'}
      className={[
        'flex min-h-[72px] flex-col gap-2 rounded-lg border-2 border-dashed p-3 transition-colors',
        isOver ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white',
      ].join(' ')}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          {meta.label}
        </span>
        <span className="text-[11px] text-gray-400">{meta.hint}</span>
      </div>
      {chips.length === 0 ? (
        <p className="py-2 text-[12px] text-gray-300">Drop a field here</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, index) => (
            <Chip
              key={`${chip.source || ''}.${chip.field}.${index}`}
              shelf={shelf}
              chip={chip}
              index={index}
              colors={colors}
              onRemove={onRemoveChip}
              onAggChange={onAggChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PivotShelf;
