import React from 'react';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import ItemEditForm, { getItemLeafRef } from './ItemEditForm';

const HEIGHT_OPTIONS = ['compact', 'xsmall', 'small', 'medium', 'large', 'xlarge', 'xxlarge'];

/**
 * Resolve the `{ type, name }` reference currently held by a dashboard item.
 * Retained as a re-export of <ItemEditForm>'s `getItemLeafRef` so existing
 * callers/tests that import `getItemRef` from RowEditForm keep working.
 */
export const getItemRef = getItemLeafRef;

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
 *   - onItemChange (fn(itemIndex, nextItem)) — (optional) full-item update used
 *                                        for container (Item.rows) edits. When
 *                                        omitted, RowEditForm derives width/ref
 *                                        changes and routes them to the legacy
 *                                        onItemWidthChange / onItemRefChange
 *                                        callbacks (bundled-form path).
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
  onItemChange,
  onSelectRef,
}) => {
  const items = row?.items || [];

  /**
   * Bridge <ItemEditForm>'s single `onChange(nextItem)` back to RowEditForm's
   * existing callback API so the bundled <DashboardEditForm> contract is
   * unchanged. If the caller supplied an `onItemChange`, prefer it (it carries
   * full-item updates including container `rows`). Otherwise derive the width /
   * leaf-ref change and route it to the legacy callbacks.
   */
  const handleItemChange = (itemIndex, nextItem) => {
    if (onItemChange) {
      onItemChange(itemIndex, nextItem);
      return;
    }
    const prev = items[itemIndex] || {};
    if (`${nextItem.width ?? ''}` !== `${prev.width ?? ''}`) {
      onItemWidthChange && onItemWidthChange(itemIndex, nextItem.width);
      return;
    }
    if (onItemRefChange) {
      onItemRefChange(itemIndex, getItemLeafRef(nextItem));
    }
  };

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
        {items.map((item, itemIndex) => (
          <ItemEditForm
            key={itemIndex}
            item={item}
            itemId={`row-${rowId}-item-${itemIndex}`}
            itemIndex={itemIndex}
            leafDropZoneId={`row-${rowId}-item-${itemIndex}`}
            onRemove={() => onRemoveItem(itemIndex)}
            onChange={nextItem => handleItemChange(itemIndex, nextItem)}
            onSelectRef={onSelectRef}
            RowComponent={RowEditForm}
          />
        ))}
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
