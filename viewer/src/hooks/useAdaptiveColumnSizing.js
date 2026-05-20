import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateColumnWidth } from '../duckdb/schemaUtils';

const MIN_COMPRESSED_COLUMN_WIDTH = 80;

/**
 * Adaptive column sizing for DataTable.
 *
 * - Natural mode (natural total ≤ container): each column uses calculateColumnWidth.
 * - Compressed mode (natural total > container): non-manual columns are
 *   distributed evenly to fit the container; manual (user-resized) columns
 *   keep their dragged width.
 *
 * "Manual" tracking: when tanstack reports `columnSizingInfo.isResizingColumn`,
 * we add that column id to a manual set. Manual columns are excluded from
 * redistribution on container resize.
 *
 * @param {Array} columns - Column metadata (name, displayName, normalizedType)
 * @param {Object} containerRef - Ref to the scrollable parent element
 * @returns {Object} { columnSizing, setColumnSizing, columnSizingInfo,
 *   setColumnSizingInfo, isCompressed, naturalSizing }
 */
export function useAdaptiveColumnSizing(columns, containerRef) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [columnSizing, setColumnSizing] = useState({});
  const [columnSizingInfo, setColumnSizingInfo] = useState({});
  const manualSetRef = useRef(new Set());
  const lastColumnsRef = useRef(columns);

  // Reset manual tracking + sizing when the column list itself changes
  // (different table loaded, schema change). Compare by stable column ids.
  useEffect(() => {
    const prevIds = lastColumnsRef.current.map(c => c.name).join('|');
    const nextIds = columns.map(c => c.name).join('|');
    if (prevIds !== nextIds) {
      manualSetRef.current = new Set();
      setColumnSizing({});
      lastColumnsRef.current = columns;
    }
  }, [columns]);

  // Track whichever column is currently being dragged so we can stamp it
  // as manual once the drag completes.
  useEffect(() => {
    const colId = columnSizingInfo.isResizingColumn;
    if (colId) {
      manualSetRef.current.add(colId);
    }
  }, [columnSizingInfo.isResizingColumn]);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect?.width ?? 0;
        if (w > 0) setContainerWidth(w);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  // Per-column natural width (text-aware, header-driven)
  const naturalSizing = useMemo(() => {
    const m = {};
    for (const col of columns) {
      m[col.name] = calculateColumnWidth(
        col.displayName || col.name,
        col.normalizedType
      );
    }
    return m;
  }, [columns]);

  const naturalTotal = useMemo(
    () => Object.values(naturalSizing).reduce((s, w) => s + w, 0),
    [naturalSizing]
  );

  const isCompressed = containerWidth > 0 && naturalTotal > containerWidth;

  // Recompute effective sizing whenever inputs change (skip during drag).
  useEffect(() => {
    if (columnSizingInfo.isResizingColumn) return;
    if (!containerWidth) return;
    if (columns.length === 0) return;

    const manual = manualSetRef.current;
    const next = {};

    if (!isCompressed) {
      for (const col of columns) {
        next[col.name] = manual.has(col.name)
          ? columnSizing[col.name] ?? naturalSizing[col.name]
          : naturalSizing[col.name];
      }
    } else {
      let manualSum = 0;
      for (const col of columns) {
        if (manual.has(col.name) && columnSizing[col.name] != null) {
          next[col.name] = columnSizing[col.name];
          manualSum += columnSizing[col.name];
        }
      }
      const nonManual = columns.filter(c => !(c.name in next));
      const remaining = Math.max(0, containerWidth - manualSum);
      const each =
        nonManual.length > 0
          ? Math.max(MIN_COMPRESSED_COLUMN_WIDTH, remaining / nonManual.length)
          : 0;
      for (const col of nonManual) {
        next[col.name] = each;
      }
    }

    let changed = false;
    for (const k of Object.keys(next)) {
      if (next[k] !== columnSizing[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      for (const k of Object.keys(columnSizing)) {
        if (!(k in next)) {
          changed = true;
          break;
        }
      }
    }
    if (changed) setColumnSizing(next);
  }, [
    containerWidth,
    columns,
    isCompressed,
    naturalSizing,
    columnSizing,
    columnSizingInfo.isResizingColumn,
  ]);

  return {
    columnSizing,
    setColumnSizing,
    columnSizingInfo,
    setColumnSizingInfo,
    isCompressed,
    naturalSizing,
    containerWidth,
    manualColumnIds: manualSetRef.current,
  };
}

export const __testing = { MIN_COMPRESSED_COLUMN_WIDTH };
