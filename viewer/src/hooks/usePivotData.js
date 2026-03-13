import { useState, useEffect } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import { runDuckDBQuery } from '../duckdb/queries';
import { buildPivotQuery } from '../utils/pivotQueryBuilder';

/**
 * Hook that executes a DuckDB PIVOT query against already-loaded insight data.
 *
 * The insight's parquet files must already be loaded into DuckDB
 * (handled by useInsightsData before the table renders).
 *
 * @param {Object} pivotConfig - { columns, rows, values } from table config
 * @param {Object} insightData - Insight data from store (with files, props_mapping)
 * @returns {{ rows: Array, columns: Array<{id: string, header: string, accessorKey: string}>, isLoading: boolean, error: string|null }}
 */
export const usePivotData = (pivotConfig, insightData) => {
  const db = useDuckDB();
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!db || !pivotConfig || !insightData?.files?.length) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const executePivot = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const tableName = insightData.files[0].name_hash;
        const propsMapping = insightData.props_mapping || {};

        // Build reverse mapping: hashed column name -> display name
        const reverseMapping = {};
        for (const [propPath, hashedName] of Object.entries(propsMapping)) {
          const displayName = propPath
            .replace(/^props\./, '')
            .replace(/\./g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
          reverseMapping[hashedName] = displayName;
        }

        const sql = buildPivotQuery(pivotConfig, propsMapping, tableName);
        console.log('[usePivotData] SQL:', sql);
        const result = await runDuckDBQuery(db, sql, 3, 1000);

        if (cancelled) return;

        const rawRows = result.toArray();
        if (rawRows.length > 0) {
          const firstRaw = rawRows[0].toJSON();
          console.log('[usePivotData] raw first row:', firstRaw);
          console.log('[usePivotData] raw first row types:', Object.fromEntries(
            Object.entries(firstRaw).map(([k, v]) => [k, `${typeof v}: ${String(v)}`])
          ));
        }

        const resultRows = rawRows.map(row => {
          const rowData = row.toJSON();
          return Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              cleanPivotValue(value),
            ])
          );
        });

        const pivotColumns =
          resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => ({
                id: key,
                header: reverseMapping[key] || formatPivotHeader(key),
                accessorKey: key.replace(/\./g, '___'),
              }))
            : [];

        setRows(resultRows);
        setColumns(pivotColumns);
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

    executePivot();

    return () => {
      cancelled = true;
    };
  }, [db, pivotConfig, insightData]);

  return { rows, columns, isLoading, error };
};

function cleanPivotValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  // DuckDB WASM PIVOT returns aggregated values as typed arrays (e.g. Uint32Array)
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return value.length > 0 ? Number(value[0]) : null;
  }
  return value;
}

function formatPivotHeader(key) {
  const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
  return cleanKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
