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

/** Default empty layout slot height for a freshly-created top-level row. */
const NEW_ROW = items => ({ height: 'medium', items });

/**
 * Insert `newItem` into the config at a canvas drop target. `target` is the
 * normalised descriptor the canvas droppables carry:
 *
 *   { kind: 'between-items', rowPath, index }   → splice into rowPath's items.
 *   { kind: 'end-of-row',    rowPath }           → append to rowPath's items.
 *   { kind: 'between-rows',  index }             → new top-level row at index.
 *   { kind: 'in-container',  itemPath }          → append a sub-row to the
 *                                                  container item at itemPath.
 *
 * Returns the config unchanged for an unrecognised target.
 */
export const insertItemAtTarget = (config, target, newItem) => {
  if (!config || !Array.isArray(config.rows) || !target) return config;
  const item = newItem || { width: 1 };

  if (target.kind === 'between-rows') {
    const idx = Math.max(0, Math.min(target.index ?? config.rows.length, config.rows.length));
    const nextRows = [...config.rows];
    nextRows.splice(idx, 0, NEW_ROW([item]));
    return { ...config, rows: nextRows };
  }

  if (target.kind === 'between-items' || target.kind === 'end-of-row') {
    const segments = parseCanvasPath(target.rowPath);
    if (!segments.length || segments[segments.length - 1].kind !== 'row') return config;
    return withRowsAtRowPath(config, segments, rows => {
      const lastRowIndex = segments[segments.length - 1].index;
      return rows.map((row, ri) => {
        if (ri !== lastRowIndex) return row;
        const items = Array.isArray(row.items) ? [...row.items] : [];
        const insertAt =
          target.kind === 'end-of-row'
            ? items.length
            : Math.max(0, Math.min(target.index ?? items.length, items.length));
        items.splice(insertAt, 0, item);
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
