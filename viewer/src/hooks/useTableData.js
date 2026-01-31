import { useState, useEffect, useMemo } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import { runDuckDBQuery } from '../duckdb/queries';
import { parseSchema } from '../duckdb/schemaUtils';
import { useDebounce } from './useDebounce';

const DEFAULT_PAGE_SIZE = 1000;

/**
 * Hook for querying a DuckDB table that is already loaded.
 * Provides paginated, sortable access to table data.
 *
 * @param {Object} options
 * @param {string} options.tableName - Name of a table already registered in DuckDB
 */
export const useTableData = ({ tableName }) => {
  const db = useDuckDB();

  const [columns, setColumns] = useState([]);
  const [totalRowCount, setTotalRowCount] = useState(0);
  const [rows, setRows] = useState([]);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [sorting, setSorting] = useState(null);
  const debouncedSorting = useDebounce(sorting, 150);

  const [isLoading, setIsLoading] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(totalRowCount / pageSize)),
    [totalRowCount, pageSize]
  );

  // Phase 1: Discover schema and row count when tableName changes
  useEffect(() => {
    if (!db || !tableName) {
      setIsReady(false);
      return;
    }

    let cancelled = false;

    const discover = async () => {
      setIsLoading(true);
      setError(null);
      setIsReady(false);

      try {
        const describeResult = await runDuckDBQuery(db, `DESCRIBE "${tableName}"`);
        const describeRows = describeResult.toArray().map(row => row.toJSON());
        const schema = parseSchema(describeRows);

        if (cancelled) return;

        const countResult = await runDuckDBQuery(
          db,
          `SELECT COUNT(*) AS total FROM "${tableName}"`
        );
        const countRows = countResult.toArray().map(row => row.toJSON());
        const total = Number(countRows[0]?.total ?? 0);

        if (cancelled) return;

        setColumns(schema);
        setTotalRowCount(total);
        setPage(0);
        setIsReady(true);
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

    discover();

    return () => {
      cancelled = true;
    };
  }, [db, tableName]);

  // Phase 2: Query data on page/sort/pageSize change
  useEffect(() => {
    if (!db || !isReady || !tableName) return;

    let cancelled = false;

    const queryData = async () => {
      setIsQuerying(true);

      try {
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

  return {
    rows,
    columns,
    totalRowCount,
    page,
    pageSize,
    pageCount,
    setPage,
    setPageSize,
    sorting,
    setSorting,
    isLoading,
    isQuerying,
    error,
  };
};
