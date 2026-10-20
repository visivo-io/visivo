import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { runDuckDBQuery, loadInsightParquetFiles, prepPostQuery } from '../duckdb/queries';
import { arrowDateToIso, getTimestampColumns } from '../duckdb/resultProcessing';
import { buildPivotQuery, buildColumnSelectQuery } from '../utils/pivotQueryBuilder';
import {
  extractAggAndColumn,
  resolveValueExpression,
  resolveFieldRef,
  parseColumnAlias,
  buildReverseMapping,
  dehashColumnKey,
  formatColumnHeader,
  plainHeader,
} from '../utils/pivotRefResolver';
import { parsePivotColumnHierarchy } from '../utils/pivotColumnParser';
import { fieldExpression, fieldFormat } from '../utils/tableFields';

/**
 * Hook that executes a DuckDB PIVOT or column-select query over a source's
 * input-resolved post-query result (insight) or raw parquet table (model).
 *
 * Each returned column carries the d3-format of the config entry it comes
 * from: a column-select column its `columns` entry, a pivot row column its
 * `rows` entry, and every pivot value column its `values` entry.
 *
 * @param {Object} config - { columns, rows, values } from table config; an entry
 *   is a string or a formatted `{ value, format }`
 * @param {Object} sourceData - Insight/model data from store (with files, query, props_mapping)
 * @returns {{ rows: Array, columns: Array, pivotMeta: Object|null, isLoading: boolean, error: string|null }}
 */
export const usePivotData = (config, sourceData) => {
  const db = useDuckDB();
  // Only the inputs this source's post-query references (useInsightsData
  // precomputes `inputDependencies`), selected shallowly so an unrelated input
  // write neither re-renders nor re-queries — the same selector Chart.jsx uses.
  const inputs = useStore(
    useShallow(state => {
      const picked = {};
      for (const inputName of sourceData?.inputDependencies || []) {
        if (state.inputJobs[inputName]) picked[inputName] = state.inputJobs[inputName];
      }
      return picked;
    })
  );
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
        // An insight source carries its post-query with `${input.accessor}`
        // placeholders; substituting the current input values yields exactly the
        // input-filtered result the chart renders, so the table reacts to inputs
        // the way `data:` tables do (VIS-1462 T1). A model source has no
        // post-query and reads its raw parquet table.
        const sourceSql = sourceData.query ? prepPostQuery(sourceData, inputs) : null;
        const tableName = sourceData.files[0].name_hash;
        const propsMapping = sourceData.props_mapping || {};

        // Ensure parquet files are loaded into DuckDB before querying
        await loadInsightParquetFiles(db, sourceData.files);
        if (cancelled) return;

        const reverseMapping = buildReverseMapping(propsMapping);
        const fields = {
          columns: (config.columns || []).map(fieldExpression),
          rows: (config.rows || []).map(fieldExpression),
          values: (config.values || []).map(fieldExpression),
        };

        let sql;
        if (isPivotMode) {
          sql = buildPivotQuery(fields, propsMapping, tableName, sourceSql);
        } else if (isColumnSelectMode) {
          sql = buildColumnSelectQuery(fields.columns, propsMapping, tableName, sourceSql);
        } else {
          setIsLoading(false);
          return;
        }

        const result = await runDuckDBQuery(db, sql, 3, 1000);

        if (cancelled) return;

        const dateColumns = getTimestampColumns(result.schema);
        const rawRows = result.toArray();
        const resultRows = rawRows.map(row => {
          const rowData = row.toJSON();
          return Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              dateColumns.has(key) && value != null ? arrowDateToIso(value) : cleanPivotValue(value),
            ])
          );
        });

        let pivotColumns;
        if (isPivotMode) {
          const aggInfo = buildAggInfo(fields.values, propsMapping, reverseMapping);
          const rowFormats = new Map(
            fields.rows.map((row, i) => [resolveFieldRef(row, propsMapping), fieldFormat(config.rows[i])])
          );
          const resolvedRowCols = new Set(rowFormats.keys());
          const resolvedPivotCols = fields.columns.map(col => resolveFieldRef(col, propsMapping));

          // DuckDB emits one column per value for each pivot combination, in
          // `values` order, so a value column's position picks its entry.
          let valueIndex = 0;
          pivotColumns = resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => {
                const isPivotRow = resolvedRowCols.has(key);
                const format = isPivotRow
                  ? rowFormats.get(key)
                  : fieldFormat(config.values[valueIndex++ % config.values.length]);
                return {
                  id: key,
                  header: reverseMapping[key] || formatPivotColumnName(key, aggInfo, reverseMapping),
                  accessorKey: key.replace(/\./g, '___'),
                  isPivotRow,
                  format,
                };
              })
            : [];

          const aggregationLabel = aggInfo
            .map(({ aggFunc, displayName }) => `${aggFunc} of ${displayName}`)
            .join(', ');
          const pivotFieldName = resolvedPivotCols
            .map(col => plainHeader(col, reverseMapping))
            .join(', ');
          const rowFieldNames = [...resolvedRowCols].map(col => plainHeader(col, reverseMapping));

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
            fields.columns.map(col => parseColumnAlias(col).alias).filter(Boolean)
          );
          const formats = new Map(
            fields.columns.map((col, i) => {
              const { ref, alias } = parseColumnAlias(col);
              return [alias || resolveFieldRef(ref, propsMapping), fieldFormat(config.columns[i])];
            })
          );
          pivotColumns = resultRows.length > 0
            ? Object.keys(resultRows[0]).map(key => ({
                id: key,
                header: aliases.has(key) ? key : plainHeader(key, reverseMapping),
                accessorKey: key.replace(/\./g, '___'),
                format: formats.get(key),
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
  }, [db, config, sourceData, inputs, isPivotMode, isColumnSelectMode]);

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
    const displayName = plainHeader(colName, reverseMapping);
    return { aggFunc: parts.aggFunc.toUpperCase(), displayName };
  });
}

/**
 * Format a pivot result column name into a readable label.
 * DuckDB PIVOT creates columns like: "blue_sum(\"hash\")" or "blue_max(\"hash\")"
 * Returns just the pivot value (e.g. "Blue") since aggregation context is shown in the banner.
 */
function formatPivotColumnName(key, aggInfo, reverseMapping) {
  let pivotValue = key;
  for (const { aggFunc } of aggInfo || []) {
    const aggLower = aggFunc.toLowerCase();
    if (new RegExp(`_${aggLower}\\b|^${aggLower}\\b`, 'i').test(key)) {
      pivotValue = key.split(new RegExp(`_${aggLower}`, 'i'))[0] || key;
      break;
    }
  }
  return formatColumnHeader(dehashColumnKey(pivotValue, reverseMapping));
}
