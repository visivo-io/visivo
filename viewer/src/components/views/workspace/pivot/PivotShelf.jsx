import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import FieldPill from '../../common/FieldPill';
import Select from '../../../common/Select';

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
 * Chips on the `values` shelf each carry an aggregation picker (brand `<Select>`)
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

// A shelf chip is the SAME shared FieldPill the rest of the app renders (icon +
// colors from objectTypeConfigs): dimensional for Columns/Rows, metric-toned for
// Values. The aggregation picker (brand Select) + remove ✕ ride in the pill's trailing
// `extra` slot so the chip keeps its full Values behaviour.
const Chip = ({ shelf, chip, index, type, onRemove, onAggChange }) => (
  <FieldPill
    type={type}
    name={chip.field}
    label={chip.label}
    data-testid={`pivot-chip-${shelf}-${index}`}
    title={chip.label}
    className="py-1"
    extra={
      <>
        {shelf === 'values' && (
          <Select
            data-testid={`pivot-chip-${shelf}-${index}-agg`}
            aria-label={`Aggregation for ${chip.label}`}
            size="sm"
            className="min-w-[110px]"
            value={chip.agg}
            // Raw chips carry an expression the builder can't represent — the
            // picker is disabled so it serialises back verbatim.
            disabled={Boolean(chip.raw)}
            options={AGGREGATIONS.map(agg => ({ value: agg, label: AGG_LABELS[agg] }))}
            onChange={agg => onAggChange(index, agg)}
          />
        )}
        <button
          type="button"
          aria-label={`Remove ${chip.label}`}
          data-testid={`pivot-chip-${shelf}-${index}-remove`}
          onClick={() => onRemove(index)}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-current opacity-60 hover:bg-white/60 hover:opacity-100"
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
      </>
    }
  />
);

const PivotShelf = ({ shelf, chips = [], onDropField, onRemoveChip, onAggChange, className = '' }) => {
  const meta = SHELF_META[shelf] || { label: shelf, hint: '' };
  // Values are measures (metric-toned); Columns/Rows are dimensional fields.
  const chipType = shelf === 'values' ? 'metric' : 'dimension';

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
        className,
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
              type={chipType}
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
