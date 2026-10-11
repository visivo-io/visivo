import { useState, useEffect, useMemo } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { runDuckDBQuery, loadInsightParquetFiles, prepPostQuery } from '../duckdb/queries';
import { buildPivotQuery, buildColumnSelectQuery } from '../utils/pivotQueryBuilder';
import {
  extractAggAndColumn,
  resolveValueExpression,
  resolveFieldRef,
  parseColumnAlias,
  buildReverseMapping,
  dehashColumnKey,
} from '../utils/pivotRefResolver';
import { parsePivotColumnHierarchy } from '../utils/pivotColumnParser';

/**
 * Resolve the SQL a table should read FROM.
 *
 * An insight source carries its post-query (`query`) with `${input.accessor}`
 * placeholders; substituting the CURRENT input values yields exactly the
 * input-filtered result set the chart path renders, so pivot / column-select
 * tables react to inputs the same way `data:` tables do (VIS-1462 T1). A model
 * source has no post-query and reads its raw parquet table.
 *
 * Returns `null` when the source has no query (read the raw table) and
 * `{ error }` when a referenced input is not available yet.
 */
export function resolveSourceSql(sourceData, inputJobs) {
  if (!sourceData?.query) return { sql: null, error: null };
  try {
    return { sql: prepPostQuery(sourceData, inputJobs || {}), error: null };
  } catch (err) {
    return { sql: null, error: err.message || String(err) };
  }
}

/**
 * Hook that executes a DuckDB PIVOT or column-select query over a source's
 * input-resolved post-query result (insight) or raw parquet table (model).
 *
 * @param {Object} config - { columns, rows, values } from table config
 * @param {Object} sourceData - Insight/model data from store (with files, query, props_mapping)
 * @returns {{ rows: Array, columns: Array, pivotMeta: Object|null, isLoading: boolean, error: string|null }}
 */
export const usePivotData = (config, sourceData) => {
  const db = useDuckDB();
  const inputJobs = useStore(state => state.inputJobs);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [pivotMeta, setPivotMeta] = useState(null);
  const [nestedColumns, setNestedColumns] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isPivotMode = !!(config?.columns && config?.rows && config?.values);
  const isColumnSelectMode = !!(config?.columns && !config?.rows && !config?.values);

  // The prepared post-query is a plain string, so it is a STABLE effect key that
  // changes exactly when a referenced input value changes (inputJobs is a fresh
  // object on every input write, but unrelated inputs leave this string alone).
  const { sql: sourceSql, error: sourceSqlError } = useMemo(
    () => resolveSourceSql(sourceData, inputJobs),
    [sourceData, inputJobs]
  );

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
        if (sourceSqlError) throw new Error(sourceSqlError);

        const tableName = sourceData.files[0].name_hash;
        const propsMapping = sourceData.props_mapping || {};

        // Ensure parquet files are loaded into DuckDB before querying
        await loadInsightParquetFiles(db, sourceData.files);
        if (cancelled) return;

        const reverseMapping = buildReverseMapping(propsMapping);

        let sql;
        if (isPivotMode) {
          sql = buildPivotQuery(config, propsMapping, tableName, sourceSql);
        } else if (isColumnSelectMode) {
          sql = buildColumnSelectQuery(config.columns, propsMapping, tableName, sourceSql);
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
          // An aliased column keeps the user's alias verbatim; an unaliased one
          // maps its (hashed) result key back to the plain prop name — a hash
          // must never be shown as a header (VIS-1462 T6).
          const aliases = new Set(
            config.columns.map(col => parseColumnAlias(col).alias).filter(Boolean)
          );
          pivotColumns = resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => ({
                id: key,
                header: aliases.has(key)
                  ? key
                  : reverseMapping[key] || formatSimpleHeader(dehashColumnKey(key, reverseMapping)),
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
  }, [db, config, sourceData, sourceSql, sourceSqlError, isPivotMode, isColumnSelectMode]);

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
    return formatSimpleHeader(dehashColumnKey(key, reverseMapping));
  }

  for (const { aggFunc } of aggInfo) {
    const aggLower = aggFunc.toLowerCase();
    const aggPattern = new RegExp(`_${aggLower}\\b|^${aggLower}\\b`, 'i');
    if (aggPattern.test(key)) {
      const parts = key.split(new RegExp(`_${aggLower}`, 'i'));
      const pivotValue = parts[0] || key;
      return formatSimpleHeader(dehashColumnKey(pivotValue, reverseMapping));
    }
  }

  if (aggInfo.length === 1) {
    if (reverseMapping[key]) return reverseMapping[key];
    return formatSimpleHeader(dehashColumnKey(key, reverseMapping));
  }

  return formatSimpleHeader(dehashColumnKey(key, reverseMapping));
}

function formatSimpleHeader(key) {
  const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
  return cleanKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
