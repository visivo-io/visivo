import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import { loadParquetFromURL, runDuckDBQuery } from '../duckdb/queries';
import { parseSchema } from '../duckdb/schemaUtils';
import { useDebounce } from './useDebounce';

const DEFAULT_PAGE_SIZE = 1000;
const LARGE_DATASET_THRESHOLD = 10000;
const LARGE_DATASET_PAGE_SIZE = 5000;

/**
 * Hook for loading parquet data into DuckDB and providing paginated, sortable access.
 *
 * @param {Object} options
 * @param {string} options.url - Parquet file URL (e.g., '/api/files/{hash}/')
 * @param {string} options.tableName - Name for the DuckDB table
 * @param {Object} [options.initialSort] - Initial sort: { column: string, direction: 'asc'|'desc' }
 * @param {number} [options.pageSize] - Override default page size
 */
export const useParquetData = ({
  url,
  tableName,
  initialSort = null,
  pageSize: pageSizeOverride = null,
}) => {
  const db = useDuckDB();

  // Schema and stats state
  const [columns, setColumns] = useState([]);
  const [columnStats, setColumnStats] = useState({});
  const [totalRowCount, setTotalRowCount] = useState(0);

  // Data state
  const [rows, setRows] = useState([]);

  // Pagination state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(pageSizeOverride || DEFAULT_PAGE_SIZE);

  // Sorting state
  const [sorting, setSorting] = useState(initialSort);
  const debouncedSorting = useDebounce(sorting, 150);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // Track if initial load has completed
  const loadedRef = useRef(false);

  // Reload key to force re-triggering the load effect
  const [loadKey, setLoadKey] = useState(0);

  // Computed values
  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(totalRowCount / pageSize)),
    [totalRowCount, pageSize]
  );

  // Phase 1: Load parquet and discover schema
  useEffect(() => {
    if (!db || !url || !tableName) return;

    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Load parquet into DuckDB (uses existing caching infrastructure)
        // Pass force=true on reload (loadKey > 0) to bypass cache
        await loadParquetFromURL(db, url, tableName, loadKey > 0);

        if (cancelled) return;

        // Get schema via DESCRIBE
        const describeResult = await runDuckDBQuery(db, `DESCRIBE "${tableName}"`);
        const describeRows = describeResult.toArray().map(row => row.toJSON());
        const schema = parseSchema(describeRows);

        if (cancelled) return;

        // Get total row count
        const countResult = await runDuckDBQuery(
          db,
          `SELECT COUNT(*) AS total FROM "${tableName}"`
        );
        const countRows = countResult.toArray().map(row => row.toJSON());
        const total = Number(countRows[0]?.total ?? 0);

        if (cancelled) return;

        // Get column stats via SUMMARIZE
        const summarizeResult = await runDuckDBQuery(db, `SUMMARIZE "${tableName}"`);
        const summarizeRows = summarizeResult.toArray().map(row => {
          const rowData = row.toJSON();
          return Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              typeof value === 'bigint' ? Number(value) : value,
            ])
          );
        });

        if (cancelled) return;

        // Build column stats map
        const stats = {};
        for (const row of summarizeRows) {
          const colName = row.column_name;
          const nullCount = (Number(row.null_percentage ?? 0) * total) / 100;
          stats[colName] = {
            nullCount: Math.round(nullCount),
            totalCount: total,
            nullPercentage: Number(row.null_percentage ?? 0),
            type: row.column_type,
            min: row.min,
            max: row.max,
            approxUnique: Number(row.approx_unique ?? 0),
            avg: row.avg != null ? Number(row.avg) : null,
            std: row.std != null ? Number(row.std) : null,
            q25: row.q25 != null ? Number(row.q25) : null,
            q50: row.q50 != null ? Number(row.q50) : null,
            q75: row.q75 != null ? Number(row.q75) : null,
          };
        }

        // Merge null percentage into schema columns
        const columnsWithStats = schema.map(col => ({
          ...col,
          nullPercentage: stats[col.name]?.nullPercentage ?? 0,
        }));

        // Auto-adjust page size for large datasets
        const effectivePageSize =
          pageSizeOverride ||
          (total < LARGE_DATASET_THRESHOLD ? total || DEFAULT_PAGE_SIZE : LARGE_DATASET_PAGE_SIZE);

        setColumns(columnsWithStats);
        setColumnStats(stats);
        setTotalRowCount(total);
        setPageSize(effectivePageSize);
        setIsReady(true);
        loadedRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setError(err.message || String(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [db, url, tableName, pageSizeOverride, loadKey]);

  // Phase 2: Query data on page/sort/pageSize change
  useEffect(() => {
    if (!db || !isReady || !tableName) return;

    let cancelled = false;

    const queryData = async () => {
      setIsQuerying(true);

      try {
        // Build SQL query
        const orderClause = debouncedSorting
          ? `ORDER BY "${debouncedSorting.column}" ${debouncedSorting.direction.toUpperCase()}`
          : '';
        const offset = page * pageSize;
        const sql = `SELECT * FROM "${tableName}" ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`;

        const result = await runDuckDBQuery(db, sql);
        const queryRows = result.toArray().map(row => {
          const rowData = row.toJSON();
          return Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              typeof value === 'bigint' ? value.toString() : value,
            ])
          );
        });

        if (!cancelled) {
          setRows(queryRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || String(err));
        }
      } finally {
        if (!cancelled) {
          setIsQuerying(false);
        }
      }
    };

    queryData();

    return () => {
      cancelled = true;
    };
  }, [db, isReady, tableName, page, pageSize, debouncedSorting]);

  // Reset page when sorting or pageSize changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSorting, pageSize]);

  // Reload function
  const reload = useCallback(() => {
    loadedRef.current = false;
    setIsReady(false);
    setIsLoading(true);
    setError(null);
    setRows([]);
    setColumns([]);
    setColumnStats({});
    setTotalRowCount(0);
    setPage(0);
    setLoadKey(k => k + 1);
  }, []);

  return {
    // Data
    rows,
    columns,
    totalRowCount,

    // Pagination
    page,
    pageSize,
    pageCount,
    setPage,
    setPageSize,

    // Sorting
    sorting,
    setSorting,

    // State
    isLoading,
    isQuerying,
    error,
    isReady,

    // Column stats (for profiling integration)
    columnStats,

    // For other components to query same DuckDB table
    tableName,

    // Actions
    reload,
  };
};
