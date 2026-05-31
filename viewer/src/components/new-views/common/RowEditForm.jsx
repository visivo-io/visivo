import React from 'react';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import RefDropZone from './RefDropZone';
import { parseRefValue } from '../../../utils/refString';

const HEIGHT_OPTIONS = ['compact', 'xsmall', 'small', 'medium', 'large', 'xlarge', 'xxlarge'];

const ITEM_REF_FIELDS = ['chart', 'table', 'markdown', 'input'];
const ALLOWED_ITEM_TYPES = ['chart', 'table', 'markdown', 'input'];

/**
 * Resolve the `{ type, name }` reference currently held by a dashboard item,
 * inspecting the per-type ref fields the dashboard model uses
 * (`chart` / `table` / `markdown` / `input`).
 */
export const getItemRef = item => {
  if (!item) return null;
  for (const field of ITEM_REF_FIELDS) {
    const val = item[field];
    if (val) {
      const name = parseRefValue(val);
      if (name) return { type: field, name };
    }
  }
  return null;
};

/**
 * RowEditForm — VIS-783 / Track F F-1.
 *
 * Standalone, presentational editor for a single dashboard row. Extracted out
 * of the previously-bundled <DashboardEditForm> so the same component drives
 * both the bundled form (one <RowEditForm> per row) and a future right-rail
 * standalone mount. All row state lives in the parent; this component is
 * controlled via callbacks.
 *
 * Each item slot is a <RefDropZone> (`row-<rowId>-item-<idx>`) accepting
 * chart / table / markdown / input. A filled slot shows an <EmbeddedPill>;
 * removing the pill clears the ref; clicking the pill selects the referenced
 * object in the workspace via `onSelectRef`.
 *
 * Props:
 *   - row          ({ height, items }) — the row config.
 *   - rowId        (string|number)     — stable id used for drop-zone ids and
 *                                        React keys (the row index today).
 *   - rowIndex     (number)            — 0-based; drives the "Row N" label.
 *   - onRemoveRow  (fn)                — remove this row.
 *   - onHeightChange (fn(height))      — change row height.
 *   - onAddItem    (fn)                — append an empty item.
 *   - onRemoveItem (fn(itemIndex))     — remove an item.
 *   - onItemWidthChange (fn(itemIndex, width))
 *   - onItemRefChange   (fn(itemIndex, { type, name } | null)) — set/clear the
 *                                        item ref (clear passes null).
 *   - onSelectRef  (fn({ type, name })) — pill click → workspace selection.
 */
const RowEditForm = ({
  row,
  rowId,
  rowIndex,
  onRemoveRow,
  onHeightChange,
  onAddItem,
  onRemoveItem,
  onItemWidthChange,
  onItemRefChange,
  onSelectRef,
}) => {
  const items = row?.items || [];

  return (
    <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-2" data-testid={`row-edit-form-${rowId}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Row {rowIndex + 1}</span>
        <button
          type="button"
          onClick={onRemoveRow}
          className="p-0.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
          aria-label={`Remove row ${rowIndex + 1}`}
        >
          <RemoveIcon fontSize="small" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600">Height:</label>
        <select
          value={row?.height || 'medium'}
          onChange={e => onHeightChange(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label={`Row ${rowIndex + 1} height`}
        >
          {HEIGHT_OPTIONS.map(h => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>

      {/* Items */}
      <div className="space-y-2 pl-2 border-l-2 border-gray-300">
        {items.map((item, itemIndex) => {
          const dropZoneId = `row-${rowId}-item-${itemIndex}`;
          const itemRef = getItemRef(item);
          return (
            <div key={itemIndex} className="p-2 bg-white border border-gray-200 rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Item {itemIndex + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemoveItem(itemIndex)}
                  className="p-0.5 text-red-400 hover:text-red-600 rounded"
                  aria-label={`Remove item ${itemIndex + 1}`}
                >
                  <RemoveIcon style={{ fontSize: 14 }} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Width:</label>
                <input
                  type="number"
                  min="1"
                  value={item.width}
                  onChange={e => onItemWidthChange(itemIndex, e.target.value)}
                  className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  aria-label={`Item ${itemIndex + 1} width`}
                />
              </div>
              <RefDropZone
                id={dropZoneId}
                allowedTypes={ALLOWED_ITEM_TYPES}
                value={itemRef}
                onClear={() => onItemRefChange(itemIndex, null)}
                onChange={ref => onItemRefChange(itemIndex, ref)}
                onSelectRef={onSelectRef}
                hint="Drop a chart, table, markdown, or input"
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAddItem}
          className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          <AddIcon style={{ fontSize: 14 }} />
          Add Item
        </button>
      </div>
    </div>
  );
};

export default RowEditForm;
