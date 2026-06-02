import React from 'react';
import RefDropZone from './RefDropZone';
import { parseRefValue, formatRef } from '../../../utils/refString';

const LEAF_REF_FIELDS = ['chart', 'table', 'markdown', 'input'];
export const ALLOWED_LEAF_TYPES = ['chart', 'table', 'markdown', 'input'];

/**
 * Resolve the `{ type, name }` leaf reference currently held by an item,
 * inspecting the per-type ref fields the dashboard model uses
 * (`chart` / `table` / `markdown` / `input`). Returns null when the item holds
 * no leaf ref (empty leaf, or a row-container).
 */
export const getItemLeafRef = item => {
  if (!item) return null;
  for (const field of LEAF_REF_FIELDS) {
    const val = item[field];
    if (val) {
      const name = parseRefValue(val);
      if (name) return { type: field, name };
    }
  }
  return null;
};

/** True when the item is acting as a row-container (`Item.rows` is set). */
export const isContainerItem = item => Array.isArray(item?.rows);

const emptyLeafFields = () => ({ chart: '', table: '', markdown: '', selector: '', input: '' });

const emptyNestedRow = () => ({
  height: 'medium',
  items: [{ width: 1, ...emptyLeafFields() }],
});

/**
 * ItemEditForm — VIS-787 / Track F F-2.
 *
 * Standalone, presentational editor for a single dashboard item. Extracted out
 * of the previously-bundled item sub-section of <RowEditForm> /
 * <DashboardEditForm> so the same component drives both the bundled form (one
 * <ItemEditForm> per item, mounted by <RowEditForm>) and a future right-rail
 * standalone mount. All item state lives in the parent; this component is
 * controlled via a single `onChange(nextItem)` callback that reports the fully
 * updated item.
 *
 * Two variants, mutually exclusive (mirrors the Pydantic
 * `validate_unique_item_types` rule — at most one of chart/table/markdown/input
 * /rows may be set):
 *   - leaf      → one <RefDropZone> (`item-<itemId>-leaf`) accepting chart /
 *                 table / markdown / input. A filled slot shows an
 *                 <EmbeddedPill>; removing the pill clears the ref; clicking it
 *                 selects the referenced object via `onSelectRef`. Dropping a
 *                 second-type ref clears the existing leaf first (mutual
 *                 exclusion).
 *   - container → `Item.rows` is set: add / remove / reorder nested sub-rows,
 *                 each rendered with the (lazily-injected) RowEditForm.
 *
 * Props:
 *   - item        (object)  — the item config ({ width, chart, table, ..., rows }).
 *   - itemId      (string|number) — stable id used for the leaf drop-zone id and
 *                                   React keys (the item index today).
 *   - itemIndex   (number)  — 0-based; drives the "Item N" label.
 *   - onChange    (fn(nextItem)) — report the fully updated item.
 *   - onRemove    (fn)      — remove this item from its parent row.
 *   - onSelectRef (fn({ type, name })) — pill click → workspace selection.
 *   - RowComponent (component) — the RowEditForm to render nested sub-rows with.
 *                                Injected to avoid a static import cycle
 *                                (RowEditForm imports ItemEditForm).
 *   - leafDropZoneId (string) — (optional) override for the leaf <RefDropZone>
 *                                id. Defaults to `item-<itemId>-leaf`. The
 *                                bundled <RowEditForm> passes the legacy
 *                                `row-<rowId>-item-<idx>` id so existing
 *                                bundled behavior stays byte-identical.
 */
const ItemEditForm = ({
  item,
  itemId,
  itemIndex,
  onChange,
  onRemove,
  onSelectRef,
  RowComponent,
  leafDropZoneId,
}) => {
  const isContainer = isContainerItem(item);
  const leafRef = getItemLeafRef(item);
  const resolvedLeafDropZoneId = leafDropZoneId || `item-${itemId}-leaf`;

  const handleWidthChange = width => {
    onChange({ ...item, width });
  };

  /**
   * Set or clear the leaf ref. `ref` is `{ type, name }` to set, or `null` to
   * clear. All leaf ref fields are reset first so only one type is ever
   * populated — this enforces the mutual exclusion: dropping a second-type ref
   * clears the existing leaf before writing the new one.
   */
  const handleLeafRefChange = ref => {
    const next = { ...item, ...emptyLeafFields() };
    delete next.rows;
    if (ref && ref.type && ref.name) {
      next[ref.type] = formatRef(ref.name);
    }
    onChange(next);
  };

  const switchToContainer = () => {
    onChange({ width: item?.width ?? 1, rows: [emptyNestedRow()] });
  };

  const switchToLeaf = () => {
    onChange({ width: item?.width ?? 1, ...emptyLeafFields() });
  };

  const rows = item?.rows || [];

  const updateRow = (rowIndex, nextRow) => {
    onChange({ ...item, rows: rows.map((r, i) => (i === rowIndex ? nextRow : r)) });
  };

  const addRow = () => {
    onChange({ ...item, rows: [...rows, emptyNestedRow()] });
  };

  const removeRow = rowIndex => {
    onChange({ ...item, rows: rows.filter((_, i) => i !== rowIndex) });
  };

  const moveRow = (rowIndex, delta) => {
    const target = rowIndex + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(rowIndex, 1);
    next.splice(target, 0, moved);
    onChange({ ...item, rows: next });
  };

  return (
    <div
      className="p-2 bg-white border border-gray-200 rounded space-y-2"
      data-testid={`item-edit-form-${itemId}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Item {itemIndex + 1}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-0.5 text-red-400 hover:text-red-600 rounded"
            aria-label={`Remove item ${itemIndex + 1}`}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>&minus;</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Width:</label>
        <input
          type="number"
          min="1"
          value={item?.width ?? 1}
          onChange={e => handleWidthChange(e.target.value)}
          className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label={`Item ${itemIndex + 1} width`}
        />
      </div>

      {/* Leaf-vs-container choice */}
      <div className="flex items-center gap-2" role="radiogroup" aria-label={`Item ${itemIndex + 1} content type`}>
        <button
          type="button"
          role="radio"
          aria-checked={!isContainer}
          onClick={switchToLeaf}
          data-testid={`item-${itemId}-mode-leaf`}
          className={[
            'px-2 py-0.5 text-xs rounded border transition-colors',
            !isContainer
              ? 'bg-[#713b57] text-white border-[#713b57]'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
          ].join(' ')}
        >
          Object
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isContainer}
          onClick={switchToContainer}
          data-testid={`item-${itemId}-mode-container`}
          className={[
            'px-2 py-0.5 text-xs rounded border transition-colors',
            isContainer
              ? 'bg-[#713b57] text-white border-[#713b57]'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
          ].join(' ')}
        >
          Nested rows
        </button>
      </div>

      {isContainer ? (
        <div className="space-y-2 pl-2 border-l-2 border-gray-300" data-testid={`item-${itemId}-rows`}>
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="space-y-1">
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => moveRow(rowIndex, -1)}
                  disabled={rowIndex === 0}
                  className="px-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  aria-label={`Move nested row ${rowIndex + 1} up`}
                >
                  &uarr;
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(rowIndex, 1)}
                  disabled={rowIndex === rows.length - 1}
                  className="px-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  aria-label={`Move nested row ${rowIndex + 1} down`}
                >
                  &darr;
                </button>
              </div>
              {RowComponent ? (
                <RowComponent
                  row={row}
                  rowId={`${itemId}-${rowIndex}`}
                  rowIndex={rowIndex}
                  onRemoveRow={() => removeRow(rowIndex)}
                  onHeightChange={height => updateRow(rowIndex, { ...row, height })}
                  onAddItem={() =>
                    updateRow(rowIndex, {
                      ...row,
                      items: [...(row.items || []), { width: 1, ...emptyLeafFields() }],
                    })
                  }
                  onRemoveItem={subItemIndex =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).filter((_, i) => i !== subItemIndex),
                    })
                  }
                  onItemWidthChange={(subItemIndex, width) =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).map((it, i) =>
                        i === subItemIndex ? { ...it, width } : it
                      ),
                    })
                  }
                  onItemRefChange={(subItemIndex, ref) =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).map((it, i) => {
                        if (i !== subItemIndex) return it;
                        const reset = { ...it, ...emptyLeafFields() };
                        if (ref && ref.type && ref.name) reset[ref.type] = formatRef(ref.name);
                        return reset;
                      }),
                    })
                  }
                  onSelectRef={onSelectRef}
                />
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            + Add Nested Row
          </button>
        </div>
      ) : (
        <RefDropZone
          id={resolvedLeafDropZoneId}
          allowedTypes={ALLOWED_LEAF_TYPES}
          value={leafRef}
          onClear={() => handleLeafRefChange(null)}
          onChange={ref => handleLeafRefChange(ref)}
          onSelectRef={onSelectRef}
          hint="Drop a chart, table, markdown, or input"
        />
      )}
    </div>
  );
};

export default ItemEditForm;
