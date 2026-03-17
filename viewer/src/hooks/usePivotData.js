import { useState, useEffect } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import { runDuckDBQuery } from '../duckdb/queries';
import { buildPivotQuery, buildColumnSelectQuery } from '../utils/pivotQueryBuilder';
import { resolveFieldRef, parseColumnAlias, extractAggAndColumn, resolveValueExpression } from '../utils/pivotRefResolver';

/**
 * Hook that executes a DuckDB PIVOT or column-select query against already-loaded data.
 *
 * @param {Object} config - { columns, rows, values } from table config
 * @param {Object} insightData - Insight data from store (with files, props_mapping)
 * @returns {{ rows: Array, columns: Array, isLoading: boolean, error: string|null }}
 */
export const usePivotData = (config, insightData) => {
  const db = useDuckDB();
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isPivotMode = !!(config?.columns && config?.rows && config?.values);
  const isColumnSelectMode = !!(config?.columns && !config?.rows && !config?.values);

  useEffect(() => {
    if (!db || !config || !insightData?.files?.length) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const execute = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const tableName = insightData.files[0].name_hash;
        const propsMapping = insightData.props_mapping || {};

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
          pivotColumns = resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => ({
                id: key,
                header: reverseMapping[key] || formatPivotColumnName(key, aggInfo, reverseMapping),
                accessorKey: key.replace(/\./g, '___'),
              }))
            : [];
        } else {
          pivotColumns = resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => ({
                id: key,
                header: key,
                accessorKey: key.replace(/\./g, '___'),
              }))
            : [];
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
  }, [db, config, insightData, isPivotMode, isColumnSelectMode]);

  return { rows, columns, isLoading, error };
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
 * We want: "blue - SUM of Revenue"
 */
function formatPivotColumnName(key, aggInfo, reverseMapping) {
  if (!aggInfo || aggInfo.length === 0) {
    return formatSimpleHeader(key);
  }

  // DuckDB PIVOT column names follow patterns like:
  // For single value: "columnValue_aggFunc(colName)" or just "columnValue"
  // For multiple values: similar but with each agg function

  // Try to match against known agg functions
  for (const { aggFunc, displayName } of aggInfo) {
    const aggLower = aggFunc.toLowerCase();
    // Check if key contains the aggregation function name
    const aggPattern = new RegExp(`_${aggLower}\\b|^${aggLower}\\b`, 'i');
    if (aggPattern.test(key)) {
      // Extract the pivot column value (everything before the agg function)
      const parts = key.split(new RegExp(`_${aggLower}`, 'i'));
      const pivotValue = parts[0] || key;
      const cleanPivotValue = formatSimpleHeader(pivotValue);
      return `${cleanPivotValue} - ${aggFunc} of ${displayName}`;
    }
  }

  // If only one aggregation and we can't match pattern, try simple split
  if (aggInfo.length === 1) {
    const { aggFunc, displayName } = aggInfo[0];
    const cleanKey = formatSimpleHeader(key);
    // If the key itself is a row group value, just return it
    if (reverseMapping[key]) return reverseMapping[key];
    return `${cleanKey} - ${aggFunc} of ${displayName}`;
  }

  return formatSimpleHeader(key);
}

function formatSimpleHeader(key) {
  const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
  return cleanKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
