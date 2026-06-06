/**
 * canvasReorder — VIS-771 / Track D D-3.
 *
 * Pure, immutable config transforms backing the Workspace canvas drag-and-drop
 * gestures. The canvas DnD overlay (CanvasDndLayer) and the shared
 * `routeWorkspaceDragEnd` router (WorkspaceDndContext) read the same composite
 * `data-canvas-path` scheme the selection overlay + Outline tree share:
 *
 *   `row.<ri>`                              → a (possibly nested) row
 *   `row.<ri>.item.<ii>`                    → an item slot
 *   `row.<ri>.item.<ii>.row.<rj>.item.<ij>` → arbitrarily nested rows/items
 *
 * Every function here returns a NEW config (never mutates) so the store's
 * optimistic-update path can swap the reference and React re-renders cleanly.
 * The shell sanitises the result with `sanitizeDashboardConfig` before it is
 * persisted, so these helpers only restructure the rows/items tree — they never
 * have to worry about backend-validity of the leaf fields.
 *
 * Three gestures, four drop intents (matching the D-2 mockup):
 *   - reorderItemsInRow   → reorder items WITHIN one row (between-items / end-of-row).
 *   - reorderTopLevelRows → reorder TOP-LEVEL rows (between-rows).
 *   - insertItemAtTarget  → insert a new item from a Library drop:
 *       · between-items   → splice into the target row at an index.
 *       · end-of-row      → append to the target row.
 *       · between-rows    → wrap in a brand-new top-level row at an index.
 *       · in-container    → append a sub-row to a container item's `rows`.
 */

import { formatRef } from '../../../../utils/refString';

/**
 * Parse a composite canvas path into a list of `{ kind, index }` segments.
 * `row.0.item.1.row.2` → [{row,0},{item,1},{row,2}]. Returns `[]` for the
 * `dashboard` chrome key or any malformed input.
 */
export const parseCanvasPath = path => {
  if (!path || typeof path !== 'string' || path === 'dashboard') return [];
  const parts = path.split('.');
  const segments = [];
  for (let i = 0; i < parts.length; i += 2) {
    const kind = parts[i];
    const index = Number(parts[i + 1]);
    if ((kind !== 'row' && kind !== 'item') || Number.isNaN(index)) return [];
    segments.push({ kind, index });
  }
  return segments;
};

/** Shallow-immutable array move: returns a new array with `from` moved to `to`. */
const arrayMove = (arr, from, to) => {
  const next = [...arr];
  if (from < 0 || from >= next.length) return next;
  const [moved] = next.splice(from, 1);
  const clamped = Math.max(0, Math.min(to, next.length));
  next.splice(clamped, 0, moved);
  return next;
};

/**
 * Resolve the `rows` array a path's segments live inside, transforming it with
 * `transformRows` and returning a new config. The path describes the CONTAINER
 * whose `items`/`rows` we mutate; we walk every segment except the last pair,
 * descending row→item→row.rows as needed. Used by both reorder + insert paths.
 *
 * `rowPathSegments` is the parsed segment list of a ROW path (ends in a `row`
 * segment). We rebuild the tree top-down, cloning only the spine to the target.
 */
const withRowsAtRowPath = (config, rowPathSegments, transformRows) => {
  if (!config || !Array.isArray(config.rows)) return config;

  // Top-level row path: [{ row, ri }].
  if (rowPathSegments.length === 1 && rowPathSegments[0].kind === 'row') {
    return { ...config, rows: transformRows(config.rows) };
  }

  // Nested: walk row → item → (descend into item.rows) repeatedly. The path
  // shape is row.<ri>.item.<ii>[.row.<rj>.item.<ij>…].row.<rk>. We recurse on
  // the item's `rows` field with the remaining segments.
  const [rowSeg, itemSeg, ...rest] = rowPathSegments;
  if (rowSeg.kind !== 'row' || !itemSeg || itemSeg.kind !== 'item') return config;

  const rows = config.rows;
  const targetRow = rows[rowSeg.index];
  if (!targetRow || !Array.isArray(targetRow.items)) return config;
  const targetItem = targetRow.items[itemSeg.index];
  if (!targetItem || !Array.isArray(targetItem.rows)) return config;

  const nextItem = withRowsAtRowPath(
    { rows: targetItem.rows },
    rest,
    transformRows
  );
  const nextItems = targetRow.items.map((it, i) =>
    i === itemSeg.index ? { ...it, rows: nextItem.rows } : it
  );
  const nextRows = rows.map((r, i) =>
    i === rowSeg.index ? { ...r, items: nextItems } : r
  );
  return { ...config, rows: nextRows };
};

/**
 * Reorder items within the row addressed by `rowPath`. `fromIndex`/`toIndex`
 * are item indices in that row's `items` array. Works at any nesting depth.
 */
export const reorderItemsInRow = (config, rowPath, fromIndex, toIndex) => {
  const segments = parseCanvasPath(rowPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'row') return config;
  if (fromIndex === toIndex) return config;
  return withRowsAtRowPath(config, segments, rows => {
    const lastRowIndex = segments[segments.length - 1].index;
    return rows.map((row, ri) => {
      if (ri !== lastRowIndex || !Array.isArray(row.items)) return row;
      return { ...row, items: arrayMove(row.items, fromIndex, toIndex) };
    });
  });
};

/** Reorder TOP-LEVEL rows. `fromIndex`/`toIndex` are top-level row indices. */
export const reorderTopLevelRows = (config, fromIndex, toIndex) => {
  if (!config || !Array.isArray(config.rows)) return config;
  if (fromIndex === toIndex) return config;
  return { ...config, rows: arrayMove(config.rows, fromIndex, toIndex) };
};

/**
 * Reorder the sibling sub-rows of the container item addressed by `containerPath`
 * (VIS-903). `fromIndex`/`toIndex` are indices within that container's `rows`.
 * Returns the config unchanged on a no-op / invalid path.
 */
export const reorderRowsInContainer = (config, containerPath, fromIndex, toIndex) => {
  if (fromIndex === toIndex) return config;
  const segments = parseCanvasPath(containerPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'item') return config;
  const itemSeg = segments[segments.length - 1];
  const rowSegments = segments.slice(0, -1);
  if (!rowSegments.length || rowSegments[rowSegments.length - 1].kind !== 'row') return config;
  return withRowsAtRowPath(config, rowSegments, rows => {
    const lastRowIndex = rowSegments[rowSegments.length - 1].index;
    return rows.map((row, ri) => {
      if (ri !== lastRowIndex || !Array.isArray(row.items)) return row;
      const nextItems = row.items.map((it, ii) => {
        if (ii !== itemSeg.index || !Array.isArray(it.rows)) return it;
        return { ...it, rows: arrayMove(it.rows, fromIndex, toIndex) };
      });
      return { ...row, items: nextItems };
    });
  });
};

/**
 * Parse the `containerPath` (item path) out of a nested row path. A nested row
 * lives under a container item: `row.0.item.1.row.0` → container `row.0.item.1`,
 * row index 0. Returns `{ containerPath, rowIndex }` for a nested row, or `null`
 * for a top-level row (`row.N`) or malformed input. Used by the canvas DnD
 * router to route a nested-row drag to `reorderRowsInContainer` (VIS-903).
 */
export const parseNestedRowPath = rowPath => {
  const segments = parseCanvasPath(rowPath);
  if (segments.length < 3 || segments[segments.length - 1].kind !== 'row') return null;
  const rowIndex = segments[segments.length - 1].index;
  const containerSegments = segments.slice(0, -1);
  if (containerSegments[containerSegments.length - 1].kind !== 'item') return null;
  const containerPath = containerSegments.map(s => `${s.kind}.${s.index}`).join('.');
  return { containerPath, rowIndex };
};

/** Default empty layout slot height for a freshly-created top-level row. */
const NEW_ROW = items => ({ height: 'medium', items });

/**
 * Resolve the `items` array of the row addressed by `rowPath` (any nesting
 * depth). Returns `[]` for a missing / malformed path. Used by the smart-width
 * helper so an insert can read its target row's existing item widths.
 */
const itemsAtRowPath = (config, rowPath) => {
  const segments = parseCanvasPath(rowPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'row') return [];
  let rows = Array.isArray(config?.rows) ? config.rows : [];
  let row = null;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.kind === 'row') {
      row = rows[seg.index];
      if (!row) return [];
      rows = null;
    } else {
      const item = Array.isArray(row?.items) ? row.items[seg.index] : null;
      if (!item) return [];
      rows = Array.isArray(item.rows) ? item.rows : [];
      row = null;
    }
  }
  return Array.isArray(row?.items) ? row.items : [];
};

/**
 * The smallest item `width` in the row addressed by `rowPath` (VIS-901 #4). An
 * insert between items defaults the new item to this width so an all-width-1 row
 * stays width-1 (balanced) rather than dropping in a default-width-1 that may not
 * match a row of wider slots. Returns `1` when the row is empty / unknown (the
 * existing default). Item width defaults to 1 when unset, mirroring the renderer.
 */
export const smallestWidthInRow = (config, rowPath) => {
  const items = itemsAtRowPath(config, rowPath);
  if (!items.length) return 1;
  return items.reduce((min, it) => {
    const w = Math.max(1, Math.round(it?.width || 1));
    return w < min ? w : min;
  }, Infinity);
};

/**
 * Insert `newItem` into the config at a canvas drop target. `target` is the
 * normalised descriptor the canvas droppables carry:
 *
 *   { kind: 'between-items', rowPath, index }   → splice into rowPath's items.
 *   { kind: 'end-of-row',    rowPath }           → append to rowPath's items.
 *   { kind: 'between-rows',  index }             → new top-level row at index.
 *   { kind: 'in-container',  itemPath }          → append a sub-row to the
 *                                                  container item at itemPath.
 *   { kind: 'on-item', rowPath, index }          → drop directly ONTO a slot
 *                                                  (VIS-901 #4): fill an EMPTY
 *                                                  slot in place, else splice in
 *                                                  before the filled slot.
 *
 * Smart width (VIS-901 #4): for a NEW item inserted between/end-of-row items the
 * default width is the SMALLEST item width in the target row, so an all-width-1
 * row stays balanced. A slot-fill (`on-item` onto an empty slot) inherits the
 * slot's existing width. Both only apply when `newItem` carries the default
 * width 1 (an explicit width from the caller is preserved).
 *
 * Returns the config unchanged for an unrecognised target.
 */
const isEmptySlot = item =>
  !!item &&
  typeof item === 'object' &&
  !item.chart &&
  !item.table &&
  !item.markdown &&
  !item.input &&
  !(Array.isArray(item.rows) && item.rows.length > 0);

// Apply the smart default width to a freshly-built item unless the caller set a
// non-default width. `buildLibraryItem` always seeds `width: 1`, so a value of 1
// is treated as "use the smart default".
const withDefaultWidth = (item, width) => {
  if (!item || typeof item !== 'object') return item;
  if ((item.width || 1) !== 1) return item; // caller set an explicit width
  if (!Number.isFinite(width) || width <= 1) return item;
  return { ...item, width };
};

export const insertItemAtTarget = (config, target, newItem) => {
  if (!config || !Array.isArray(config.rows) || !target) return config;
  const item = newItem || { width: 1 };

  if (target.kind === 'between-rows') {
    // Top-level between-rows → splice a new top-level row at the index.
    if (!target.containerPath) {
      const idx = Math.max(0, Math.min(target.index ?? config.rows.length, config.rows.length));
      const nextRows = [...config.rows];
      nextRows.splice(idx, 0, NEW_ROW([item]));
      return { ...config, rows: nextRows };
    }
    // Nested between-rows (VIS-903) → splice a new sub-row into the container
    // item addressed by `containerPath` at the index, among its sibling rows.
    const segments = parseCanvasPath(target.containerPath);
    if (!segments.length || segments[segments.length - 1].kind !== 'item') return config;
    const itemSeg = segments[segments.length - 1];
    const rowSegments = segments.slice(0, -1);
    if (!rowSegments.length || rowSegments[rowSegments.length - 1].kind !== 'row') return config;
    return withRowsAtRowPath(config, rowSegments, rows => {
      const lastRowIndex = rowSegments[rowSegments.length - 1].index;
      return rows.map((row, ri) => {
        if (ri !== lastRowIndex || !Array.isArray(row.items)) return row;
        const nextItems = row.items.map((it, ii) => {
          if (ii !== itemSeg.index) return it;
          const subRows = Array.isArray(it.rows) ? [...it.rows] : [];
          const idx = Math.max(0, Math.min(target.index ?? subRows.length, subRows.length));
          subRows.splice(idx, 0, NEW_ROW([item]));
          return { ...it, rows: subRows };
        });
        return { ...row, items: nextItems };
      });
    });
  }

  // Drop directly onto an existing item slot (VIS-901 #4). An EMPTY slot is
  // filled in place (the new leaf inherits the slot's width); a FILLED slot
  // splices the new item in just before it (smart-width default).
  if (target.kind === 'on-item') {
    const segments = parseCanvasPath(target.rowPath);
    if (!segments.length || segments[segments.length - 1].kind !== 'row') return config;
    const smart = smallestWidthInRow(config, target.rowPath);
    return withRowsAtRowPath(config, segments, rows => {
      const lastRowIndex = segments[segments.length - 1].index;
      return rows.map((row, ri) => {
        if (ri !== lastRowIndex) return row;
        const items = Array.isArray(row.items) ? [...row.items] : [];
        const idx = Math.max(0, Math.min(target.index ?? items.length, items.length));
        const existing = items[idx];
        if (isEmptySlot(existing)) {
          // Fill the empty slot in place, preserving its width.
          const slotWidth = existing.width || 1;
          items[idx] = { ...existing, ...item, width: slotWidth };
        } else {
          items.splice(idx, 0, withDefaultWidth(item, smart));
        }
        return { ...row, items };
      });
    });
  }

  if (target.kind === 'between-items' || target.kind === 'end-of-row') {
    const segments = parseCanvasPath(target.rowPath);
    if (!segments.length || segments[segments.length - 1].kind !== 'row') return config;
    const smart = smallestWidthInRow(config, target.rowPath);
    const sized = withDefaultWidth(item, smart);
    return withRowsAtRowPath(config, segments, rows => {
      const lastRowIndex = segments[segments.length - 1].index;
      return rows.map((row, ri) => {
        if (ri !== lastRowIndex) return row;
        const items = Array.isArray(row.items) ? [...row.items] : [];
        const insertAt =
          target.kind === 'end-of-row'
            ? items.length
            : Math.max(0, Math.min(target.index ?? items.length, items.length));
        items.splice(insertAt, 0, sized);
        return { ...row, items };
      });
    });
  }

  if (target.kind === 'in-container') {
    const segments = parseCanvasPath(target.itemPath);
    if (!segments.length || segments[segments.length - 1].kind !== 'item') return config;
    // The container's `rows` lives under the item; reuse the row-path walker by
    // treating the item's parent row path + the item index.
    const itemSeg = segments[segments.length - 1];
    const rowSegments = segments.slice(0, -1); // ends in a `row` segment
    return withRowsAtRowPath(config, rowSegments, rows => {
      const lastRowIndex = rowSegments[rowSegments.length - 1].index;
      return rows.map((row, ri) => {
        if (ri !== lastRowIndex || !Array.isArray(row.items)) return row;
        const nextItems = row.items.map((it, ii) => {
          if (ii !== itemSeg.index) return it;
          const subRows = Array.isArray(it.rows) ? it.rows : [];
          return { ...it, rows: [...subRows, NEW_ROW([item])] };
        });
        return { ...row, items: nextItems };
      });
    });
  }

  return config;
};

/**
 * Build the dashboard-item leaf field for a Library-dropped object. A chart /
 * table / markdown / input becomes `{ width: 1, <type>: '${ref(name)}' }`. The
 * shell sanitises the ref string, so we store the bare `ref(name)` form the
 * other right-rail writers use.
 */
export const buildLibraryItem = (type, name) => {
  const item = { width: 1 };
  if (type && name) item[type] = formatRef(name);
  return item;
};

// ── Wrap-in-container helpers (VIS-781 / Track D D-5) ───────────────────────
// Pure, immutable transforms that turn a leaf item into a row-container and
// manage container sub-rows/items. Like the reorder helpers, they walk the
// composite `data-canvas-path` spine and clone only the path to the target.

// Is `item` a leaf (a chart/table/markdown/input slot, OR an empty slot) rather
// than an existing container (`Item.rows`)? Only leaves can be wrapped.
const isLeafItem = item =>
  !!item && typeof item === 'object' && !(Array.isArray(item.rows) && item.rows.length > 0);

/**
 * Transform the single item at `itemPath` in place (immutably), returning a new
 * config. `transformItem(item)` returns the replacement item (or the same ref
 * for a no-op). Returns the config unchanged for an invalid path or when the
 * transform returns the same item reference. Shared by wrap / unwrap / add-row.
 */
const withItemAtPath = (config, itemPath, transformItem) => {
  const segments = parseCanvasPath(itemPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'item') return config;
  const itemSeg = segments[segments.length - 1];
  const rowSegments = segments.slice(0, -1);
  if (!rowSegments.length || rowSegments[rowSegments.length - 1].kind !== 'row') return config;
  let changed = false;
  const next = withRowsAtRowPath(config, rowSegments, rows => {
    const lastRowIndex = rowSegments[rowSegments.length - 1].index;
    return rows.map((row, ri) => {
      if (ri !== lastRowIndex || !Array.isArray(row.items)) return row;
      const items = row.items.map((it, ii) => {
        if (ii !== itemSeg.index) return it;
        const replacement = transformItem(it);
        if (replacement === it) return it;
        changed = true;
        return replacement;
      });
      return changed ? { ...row, items } : row;
    });
  });
  return changed ? next : config;
};

/**
 * Wrap the LEAF item at `itemPath` in a single-row container (D-5). The original
 * leaf becomes the single inner item of a new `{ rows: [{ items: [original] }] }`
 * container; the container inherits the original's `width` (so the slot keeps
 * its column span), and the inner item drops its own width (it fills the
 * container's single row). No depth limit (Q12). Returns the config unchanged if
 * the path is invalid or the item is already a container.
 */
export const wrapItemInContainer = (config, itemPath) =>
  withItemAtPath(config, itemPath, item => {
    if (!isLeafItem(item)) return item;
    const width = item.width || 1;
    const inner = { ...item };
    delete inner.width;
    return { width, rows: [{ height: 'medium', items: [inner] }] };
  });

/**
 * Is the container at `itemPath` TRIVIALLY wrapped — exactly one sub-row holding
 * exactly one inner item? Only trivial containers can be unwrapped back to a
 * leaf without losing layout. Returns false for a leaf or a multi-row/multi-item
 * container.
 */
export const isTriviallyWrappedContainer = (config, itemPath) => {
  const segments = parseCanvasPath(itemPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'item') return false;
  let rows = Array.isArray(config?.rows) ? config.rows : null;
  let item = null;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.kind === 'row') {
      if (!rows || !rows[seg.index]) return false;
      rows = Array.isArray(rows[seg.index].items) ? rows[seg.index].items : null;
    } else {
      if (!rows || !rows[seg.index]) return false;
      item = rows[seg.index];
      rows = Array.isArray(item.rows) ? item.rows : null;
    }
  }
  if (!item || !Array.isArray(item.rows) || item.rows.length !== 1) return false;
  const inner = Array.isArray(item.rows[0].items) ? item.rows[0].items : [];
  return inner.length === 1;
};

/**
 * Unwrap the TRIVIALLY-wrapped container at `itemPath` back to its single inner
 * leaf (D-5 inverse). The inner item inherits the container's `width` (so the
 * slot keeps its span). Returns the config unchanged if the container is not
 * trivially wrapped (multi-row / multi-item containers are left intact — there's
 * no unambiguous leaf to collapse to).
 */
export const unwrapTrivialContainer = (config, itemPath) => {
  if (!isTriviallyWrappedContainer(config, itemPath)) return config;
  return withItemAtPath(config, itemPath, item => {
    const width = item.width || 1;
    const inner = item.rows[0].items[0];
    return { ...inner, width };
  });
};

/**
 * Add a new empty sub-row INSIDE the container at `itemPath` (D-5). Appends a
 * `{ height: 'medium', items: [{ width: 1 }] }` row to the container's `rows`.
 * Returns the config unchanged if the path is not a container item.
 */
export const addRowInsideContainer = (config, itemPath) =>
  withItemAtPath(config, itemPath, item => {
    if (!Array.isArray(item.rows)) return item;
    return { ...item, rows: [...item.rows, NEW_ROW([{ width: 1 }])] };
  });

/**
 * Append a new empty item slot to the row addressed by `rowPath` (D-5
 * "Add item to row"). Works at any nesting depth. The new slot defaults to the
 * smallest existing item width so an all-width-1 row stays balanced. Returns the
 * config unchanged for an invalid path.
 */
export const addItemToRow = (config, rowPath) => {
  const segments = parseCanvasPath(rowPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'row') return config;
  const smart = smallestWidthInRow(config, rowPath);
  const width = Number.isFinite(smart) && smart > 1 ? smart : 1;
  return withRowsAtRowPath(config, segments, rows => {
    const lastRowIndex = segments[segments.length - 1].index;
    return rows.map((row, ri) => {
      if (ri !== lastRowIndex) return row;
      const items = Array.isArray(row.items) ? [...row.items] : [];
      items.push({ width });
      return { ...row, items };
    });
  });
};

// ── Resize helpers (VIS-777 / Track D D-4) ──────────────────────────────────
// The canvas resize overlay (CanvasResizeLayer) turns the selection's edge
// handles into real gestures. These are the pure, immutable config transforms
// behind them — they mirror the reorder helpers above: walk the composite
// `data-canvas-path` spine, clone only the path to the target, return a NEW
// config. The shell sanitises the result before persisting.

/**
 * Row.height accepts `Union[HeightEnum, int]` (VIS-770). The enum tick stops,
 * ascending, with their pixel sizes mirroring Dashboard.getHeight(). `compact`
 * is the smallest stop; the renderer treats it specially (no explicit height),
 * so it maps to the same floor as `xsmall` for snapping purposes.
 */
export const HEIGHT_ENUM_STOPS = [
  { label: 'compact', px: 96 },
  { label: 'xsmall', px: 128 },
  { label: 'small', px: 256 },
  { label: 'medium', px: 396 },
  { label: 'large', px: 512 },
  { label: 'xlarge', px: 768 },
  { label: 'xxlarge', px: 1024 },
];

/** Map a HeightEnum token to its pixel size (mirrors Dashboard.getHeight). */
export const heightEnumToPixels = label => {
  const stop = HEIGHT_ENUM_STOPS.find(s => s.label === label);
  return stop ? stop.px : 396;
};

/**
 * Snap a pixel height to the NEAREST HeightEnum token. Used in tick mode so a
 * height drag steps through the enum stops with labels. Ties resolve to the
 * smaller stop (stable as the cursor crosses a midpoint).
 */
export const pixelsToNearestHeightEnum = px => {
  if (typeof px !== 'number' || Number.isNaN(px)) return 'medium';
  let best = HEIGHT_ENUM_STOPS[0];
  let bestDist = Math.abs(px - best.px);
  for (const stop of HEIGHT_ENUM_STOPS) {
    const dist = Math.abs(px - stop.px);
    if (dist < bestDist) {
      best = stop;
      bestDist = dist;
    }
  }
  return best.label;
};

/** Clamp a number to [min, max], rounding to an integer. */
const clampInt = (value, min, max) => {
  const n = Math.round(Number(value));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
};

/**
 * Set the integer column WIDTH (grid span) of the item at `itemPath`. Widths
 * are relative within their row (the row's grid total is the sum of item
 * widths), so changing one item's span rebalances its siblings automatically —
 * a 6/6 row where item 0 grows to 8 becomes an 8/6 row (8/14 vs 6/14). Width is
 * clamped to [1, 12]. Works at any nesting depth. Returns the config unchanged
 * when the width is already `nextWidth` or the path is invalid.
 */
export const setItemWidth = (config, itemPath, nextWidth) => {
  const segments = parseCanvasPath(itemPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'item') return config;
  const width = clampInt(nextWidth, 1, 12);
  const itemSeg = segments[segments.length - 1];
  const rowSegments = segments.slice(0, -1);
  if (!rowSegments.length || rowSegments[rowSegments.length - 1].kind !== 'row') return config;
  let changed = false;
  const next = withRowsAtRowPath(config, rowSegments, rows => {
    const lastRowIndex = rowSegments[rowSegments.length - 1].index;
    return rows.map((row, ri) => {
      if (ri !== lastRowIndex || !Array.isArray(row.items)) return row;
      const items = row.items.map((it, ii) => {
        if (ii !== itemSeg.index) return it;
        if ((it.width || 1) === width) return it;
        changed = true;
        return { ...it, width };
      });
      return changed ? { ...row, items } : row;
    });
  });
  return changed ? next : config;
};

/**
 * Resize the item at `rowPath`/`itemIndex` from its LEFT boundary — the edge it
 * shares with the PREVIOUS sibling in the row. `deltaCols` is the integer number
 * of grid columns to transfer ACROSS that shared boundary: a positive `deltaCols`
 * grows this item by that many columns and shrinks the left neighbour by the same
 * amount; a negative `deltaCols` does the inverse. Neither item is allowed below
 * width 1, so the transfer is clamped to the columns actually available. The row
 * grid total is unchanged (columns only move between the two adjacent items).
 *
 * The FIRST item in a row (index 0) has no left neighbour and therefore no shared
 * boundary, so this is a no-op there — it never invents a phantom neighbour.
 * Returns the config unchanged on a no-op (delta 0, clamped to 0, index 0, or an
 * invalid path).
 */
export const resizeItemFromLeft = (config, rowPath, itemIndex, deltaCols) => {
  const segments = parseCanvasPath(rowPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'row') return config;
  if (!Number.isInteger(itemIndex) || itemIndex <= 0) return config;
  const delta = Math.round(Number(deltaCols));
  if (Number.isNaN(delta) || delta === 0) return config;

  let changed = false;
  const next = withRowsAtRowPath(config, segments, rows => {
    const lastRowIndex = segments[segments.length - 1].index;
    return rows.map((row, ri) => {
      if (ri !== lastRowIndex || !Array.isArray(row.items)) return row;
      const neighbourIndex = itemIndex - 1;
      const self = row.items[itemIndex];
      const neighbour = row.items[neighbourIndex];
      if (!self || !neighbour) return row;
      const selfWidth = self.width || 1;
      const neighbourWidth = neighbour.width || 1;
      // Clamp the transfer so neither item drops below width 1: growing self
      // (positive delta) is bounded by the neighbour's spare columns; shrinking
      // self (negative delta) is bounded by self's spare columns.
      const transfer = Math.max(
        -(selfWidth - 1),
        Math.min(neighbourWidth - 1, delta)
      );
      if (transfer === 0) return row;
      changed = true;
      const items = row.items.map((it, ii) => {
        if (ii === itemIndex) return { ...it, width: selfWidth + transfer };
        if (ii === neighbourIndex) return { ...it, width: neighbourWidth - transfer };
        return it;
      });
      return { ...row, items };
    });
  });
  return changed ? next : config;
};

/**
 * Set the HEIGHT of the row at `rowPath`. `nextHeight` is either a HeightEnum
 * token (string, tick mode) or a positive integer (px, Shift-fluid mode —
 * Row.height accepts `Union[HeightEnum, int]`). Integers are clamped to a sane
 * floor/ceiling. Works at any nesting depth (top-level rows interpret height as
 * absolute px; nested sub-rows interpret the same field as a relative weight —
 * see Dashboard.heightToWeight). Returns config unchanged on no-op / bad path.
 */
export const setRowHeight = (config, rowPath, nextHeight) => {
  const segments = parseCanvasPath(rowPath);
  if (!segments.length || segments[segments.length - 1].kind !== 'row') return config;
  const height =
    typeof nextHeight === 'number' ? clampInt(nextHeight, 48, 2048) : nextHeight;
  let changed = false;
  const next = withRowsAtRowPath(config, segments, rows => {
    const lastRowIndex = segments[segments.length - 1].index;
    return rows.map((row, ri) => {
      if (ri !== lastRowIndex) return row;
      if (row.height === height) return row;
      changed = true;
      return { ...row, height };
    });
  });
  return changed ? next : config;
};

/**
 * Row templates backing the "+ Add Row" picker (VIS-794 / D-7). Each is a
 * pure layout SHAPE — a row of empty item slots (`{ width }`), NOT a content
 * thumbnail. The user picks the column layout, then drags / inline-creates
 * items into the slots. `widths` is the per-slot `width` (the 12-col grid is
 * derived from their sum by <Dashboard>'s grid layout). The shell's
 * `sanitizeDashboardConfig` accepts an empty `{ width }` slot as backend-valid,
 * so a freshly-inserted template row persists cleanly with no leaf refs.
 *
 *   blank  → 1 full-width slot.
 *   kpi    → 4 equal narrow slots (a headline-metrics strip).
 *   2up    → 2 equal slots.
 *   3up    → 3 equal slots.
 *   mix    → 1 wide slot + 1 narrow slot.
 */
export const ROW_TEMPLATES = [
  { key: 'blank', name: 'Blank', desc: 'Single empty slot', widths: [12] },
  { key: 'kpi', name: 'KPI strip', desc: '4 small slots for headline metrics', widths: [3, 3, 3, 3] },
  { key: '2up', name: '2-up', desc: 'Two equal-width slots', widths: [6, 6] },
  { key: '3up', name: '3-up', desc: 'Three equal-width slots', widths: [4, 4, 4] },
  { key: 'mix', name: 'Mixed', desc: 'One wide slot + one narrow', widths: [8, 4] },
];

/**
 * Build a brand-new top-level row from a template key (VIS-794 / D-7). Returns a
 * `{ height: 'medium', items: [{ width }, …] }` row of empty slots, or `null`
 * for an unknown key. Pure — never reads/mutates external state.
 */
export const buildTemplateRow = templateKey => {
  const template = ROW_TEMPLATES.find(t => t.key === templateKey);
  if (!template) return null;
  return { height: 'medium', items: template.widths.map(width => ({ width })) };
};

/**
 * Insert a fully-formed `row` into the config's top-level `rows` at `index`
 * (clamped to `[0, rows.length]`). Returns a NEW config (never mutates); an
 * out-of-shape config or a falsy `row` returns the config unchanged. Used by the
 * "+ Add Row" affordance + the empty-canvas CTA to commit a templated row.
 */
export const insertRowAtIndex = (config, index, row) => {
  if (!row || typeof row !== 'object') return config;
  const baseRows = config && Array.isArray(config.rows) ? config.rows : [];
  const idx = Math.max(0, Math.min(index ?? baseRows.length, baseRows.length));
  const nextRows = [...baseRows];
  nextRows.splice(idx, 0, row);
  return { ...(config || {}), rows: nextRows };
};
