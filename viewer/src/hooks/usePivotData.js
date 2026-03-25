import { useState, useEffect } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import { runDuckDBQuery, loadInsightParquetFiles } from '../duckdb/queries';
import { buildPivotQuery, buildColumnSelectQuery } from '../utils/pivotQueryBuilder';
import { extractAggAndColumn, resolveValueExpression, resolveFieldRef } from '../utils/pivotRefResolver';
import { parsePivotColumnHierarchy } from '../utils/pivotColumnParser';

/**
 * Hook that executes a DuckDB PIVOT or column-select query against already-loaded data.
 *
 * @param {Object} config - { columns, rows, values } from table config
 * @param {Object} sourceData - Insight data from store (with files, props_mapping)
 * @returns {{ rows: Array, columns: Array, pivotMeta: Object|null, isLoading: boolean, error: string|null }}
 */
export const usePivotData = (config, sourceData) => {
  const db = useDuckDB();
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [pivotMeta, setPivotMeta] = useState(null);
  const [nestedColumns, setNestedColumns] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isPivotMode = !!(config?.columns && config?.rows && config?.values);
  const isColumnSelectMode = !!(config?.columns && !config?.rows && !config?.values);

  useEffect(() => {
    if (!db || !config || !sourceData?.files?.length || sourceData?.data === null) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const execute = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const tableName = sourceData.files[0].name_hash;
        const propsMapping = sourceData.props_mapping || {};

        // Ensure parquet files are loaded into DuckDB before querying
        await loadInsightParquetFiles(db, sourceData.files);
        if (cancelled) return;

        const reverseMapping = {};
        for (const [propPath, hashedName] of Object.entries(propsMapping)) {
          const displayName = propPath
            .replace(/^props\./, '')
            .replace(/\./g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
          reverseMapping[hashedName] = displayName;
        }

        let sql;
        if (isPivotMode) {
          sql = buildPivotQuery(config, propsMapping, tableName);
        } else if (isColumnSelectMode) {
          sql = buildColumnSelectQuery(config.columns, propsMapping, tableName);
        } else {
          setIsLoading(false);
          return;
        }

        const result = await runDuckDBQuery(db, sql, 3, 1000);

        if (cancelled) return;

        const rawRows = result.toArray();
        const resultRows = rawRows.map(row => {
          const rowData = row.toJSON();
          return Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              cleanPivotValue(value),
            ])
          );
        });

        let pivotColumns;
        if (isPivotMode) {
          const aggInfo = buildAggInfo(config.values, propsMapping, reverseMapping);
          const resolvedRowCols = new Set(
            config.rows.map(row => resolveFieldRef(row, propsMapping))
          );
          const resolvedPivotCols = config.columns.map(col => resolveFieldRef(col, propsMapping));

          pivotColumns = resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => ({
                id: key,
                header: reverseMapping[key] || formatPivotColumnName(key, aggInfo, reverseMapping),
                accessorKey: key.replace(/\./g, '___'),
                isPivotRow: resolvedRowCols.has(key),
              }))
            : [];

          const aggregationLabel = aggInfo
            .map(({ aggFunc, displayName }) => `${aggFunc} of ${displayName}`)
            .join(', ');
          const pivotFieldName = resolvedPivotCols
            .map(col => reverseMapping[col] || formatSimpleHeader(col))
            .join(', ');
          const rowFieldNames = [...resolvedRowCols]
            .map(col => reverseMapping[col] || formatSimpleHeader(col));

          setPivotMeta({ aggregationLabel, pivotFieldName, rowFieldNames });

          // Build nested column hierarchy for multi-level headers
          if (resultRows.length > 0) {
            const resultColumnKeys = Object.keys(resultRows[0]);
            const nested = parsePivotColumnHierarchy(
              resultColumnKeys, resolvedRowCols, resolvedPivotCols, aggInfo, reverseMapping
            );
            setNestedColumns(nested);
          } else {
            setNestedColumns(null);
          }
        } else {
          pivotColumns = resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => ({
                id: key,
                header: key,
                accessorKey: key.replace(/\./g, '___'),
              }))
            : [];
          setPivotMeta(null);
          setNestedColumns(null);
        }

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

    execute();

    return () => {
      cancelled = true;
    };
  }, [db, config, sourceData, isPivotMode, isColumnSelectMode]);

  return { rows, columns, nestedColumns, pivotMeta, isLoading, error };
};

function cleanPivotValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return value.length > 0 ? Number(value[0]) : null;
  }
  return value;
}

/**
 * Build aggregation info from value expressions for header formatting.
 * Returns array of { aggFunc, displayName } for each value expression.
 */
function buildAggInfo(values, propsMapping, reverseMapping) {
  return values.map(value => {
    const resolved = resolveValueExpression(value, propsMapping);
    const parts = extractAggAndColumn(resolved);
    if (!parts) return { aggFunc: '', displayName: value };

    const colName = parts.column.replace(/"/g, '');
    const displayName = reverseMapping[colName] || formatSimpleHeader(colName);
    return { aggFunc: parts.aggFunc.toUpperCase(), displayName };
  });
}

/**
 * Format a pivot result column name into a readable label.
 * DuckDB PIVOT creates columns like: "blue_sum(\"hash\")" or "blue_max(\"hash\")"
 * Returns just the pivot value (e.g. "Blue") since aggregation context is shown in the banner.
 */
function formatPivotColumnName(key, aggInfo, reverseMapping) {
  if (!aggInfo || aggInfo.length === 0) {
    return formatSimpleHeader(key);
  }

  for (const { aggFunc } of aggInfo) {
    const aggLower = aggFunc.toLowerCase();
    const aggPattern = new RegExp(`_${aggLower}\\b|^${aggLower}\\b`, 'i');
    if (aggPattern.test(key)) {
      const parts = key.split(new RegExp(`_${aggLower}`, 'i'));
      const pivotValue = parts[0] || key;
      return formatSimpleHeader(pivotValue);
    }
  }

  if (aggInfo.length === 1) {
    if (reverseMapping[key]) return reverseMapping[key];
    return formatSimpleHeader(key);
  }

  return formatSimpleHeader(key);
}

function formatSimpleHeader(key) {
  const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
  return cleanKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
