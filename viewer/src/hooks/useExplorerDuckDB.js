import { useEffect, useRef, useCallback } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import { runDuckDBQuery } from '../duckdb/queries';
import { getConnection } from '../duckdb/duckdb';
import useStore from '../stores/store';
import { translateExpressions } from '../api/expressions';

const EXPLORER_TABLE_PREFIX = 'explorer_';

/**
 * Hook that manages DuckDB WASM integration for the Explorer.
 *
 * Responsibilities:
 * 1. Load explorerQueryResult into a DuckDB WASM table when results change
 * 2. When computedColumns change, run them via DuckDB and produce enrichedResult
 * 3. Handle expression dialect translation via backend API
 */
const useExplorerDuckDB = () => {
  const db = useDuckDB();
  const queryResult = useStore((s) => s.explorerQueryResult);
  const computedColumns = useStore((s) => s.explorerComputedColumns);
  const sourceName = useStore((s) => s.explorerSourceName);
  const duckDBTableName = useStore((s) => s.explorerDuckDBTableName);
  const setDuckDBTableName = useStore((s) => s.setExplorerDuckDBTableName);
  const setDuckDBLoading = useStore((s) => s.setExplorerDuckDBLoading);
  const setDuckDBError = useStore((s) => s.setExplorerDuckDBError);
  const setEnrichedResult = useStore((s) => s.setExplorerEnrichedResult);
  const setFailedComputedColumns = useStore((s) => s.setExplorerFailedComputedColumns);

  const loadingRef = useRef(false);
  const tableCounterRef = useRef(0);

  // Step 1: Load query results into DuckDB when they change
  useEffect(() => {
    if (!db || !queryResult?.rows?.length || !queryResult?.columns?.length) {
      return;
    }

    const loadResults = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setDuckDBLoading(true);
      setDuckDBError(null);

      try {
        // Generate unique table name per load
        tableCounterRef.current += 1;
        const tableName = `${EXPLORER_TABLE_PREFIX}${tableCounterRef.current}`;

        const conn = await getConnection(db);

        // Drop previous explorer tables
        if (duckDBTableName) {
          try {
            await conn.query(`DROP TABLE IF EXISTS "${duckDBTableName}"`);
          } catch {
            // Ignore drop errors
          }
        }

        // Convert rows to JSON and load into DuckDB
        const jsonData = JSON.stringify(queryResult.rows);
        const tempFile = `explorer_data_${Date.now()}.json`;
        await db.registerFileText(tempFile, jsonData);

        await conn.query(`
          CREATE TABLE "${tableName}" AS
          SELECT * FROM read_json_auto('${tempFile}')
        `);

        await db.dropFile(tempFile);
        setDuckDBTableName(tableName);
      } catch (err) {
        setDuckDBError(err.message || String(err));
      } finally {
        loadingRef.current = false;
        setDuckDBLoading(false);
      }
    };

    loadResults();
  }, [db, queryResult, setDuckDBTableName, setDuckDBLoading, setDuckDBError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: Compute enriched results when computed columns or table change
  useEffect(() => {
    if (!db || !duckDBTableName || computedColumns.length === 0) {
      // No computed columns → enriched result is just the base query result
      if (computedColumns.length === 0) {
        setEnrichedResult(null);
      }
      return;
    }

    const computeEnriched = async () => {
      setDuckDBLoading(true);
      setDuckDBError(null);
      setFailedComputedColumns({});

      try {
        // Translate expressions to DuckDB dialect
        const needsTranslation = computedColumns.filter((c) => c.sourceDialect);
        let translatedColumns = computedColumns;

        if (needsTranslation.length > 0) {
          const { translations } = await translateExpressions(
            needsTranslation.map((c) => ({
              name: c.name,
              expression: c.expression,
              type: c.type,
            })),
            needsTranslation[0].sourceDialect
          );

          // Merge translations back
          const translationMap = new Map(translations.map((t) => [t.name, t.duckdb_expression]));
          translatedColumns = computedColumns.map((c) => ({
            ...c,
            duckdbExpression: translationMap.get(c.name) || c.expression,
          }));
        } else {
          translatedColumns = computedColumns.map((c) => ({
            ...c,
            duckdbExpression: c.expression,
          }));
        }

        // Build SELECT with computed columns
        // Try each column individually — if one fails (e.g. type mismatch from JSON-loaded data),
        // replace it with NULL so the rest still work
        const buildSelectPart = (col) => {
          if (col.type === 'metric') {
            return `${col.duckdbExpression} OVER () AS "${col.name}"`;
          }
          return `${col.duckdbExpression} AS "${col.name}"`;
        };

        let computedSelectParts = translatedColumns.map(buildSelectPart);
        let sql = `SELECT *, ${computedSelectParts.join(', ')} FROM "${duckDBTableName}"`;
        let result;
        const failedColumnsMap = {};

        try {
          result = await runDuckDBQuery(db, sql);
        } catch {
          // Full query failed — test each computed column individually
          const workingParts = [];
          for (const col of translatedColumns) {
            const testSql = `SELECT ${buildSelectPart(col)} FROM "${duckDBTableName}" LIMIT 1`;
            try {
              await runDuckDBQuery(db, testSql);
              workingParts.push(buildSelectPart(col));
            } catch (colErr) {
              failedColumnsMap[col.name] = colErr.message || String(colErr);
              workingParts.push(`NULL AS "${col.name}"`);
            }
          }
          sql = `SELECT *, ${workingParts.join(', ')} FROM "${duckDBTableName}"`;
          result = await runDuckDBQuery(db, sql);
        }

        const failedNames = Object.keys(failedColumnsMap);
        if (failedNames.length > 0) {
          setFailedComputedColumns(failedColumnsMap);
        }
        // Extract rows via column vectors — avoids toJSON() which
        // corrupts HUGEINT/Decimal values with extra JSON quoting
        const fields = result.schema.fields;
        const numRows = result.numRows;
        const vectors = fields.map((_, i) => result.getChildAt(i));
        const columns = fields.map((f) => f.name);
        const rows = [];
        for (let r = 0; r < numRows; r++) {
          const row = {};
          for (let c = 0; c < fields.length; c++) {
            let value = vectors[c].get(r);
            if (typeof value === 'bigint') {
              value = Number(value);
            } else if (value !== null && value !== undefined && typeof value === 'object') {
              const s = String(value);
              const n = Number(s);
              value = !isNaN(n) && s.trim() !== '' ? n : s;
            }
            row[columns[c]] = value;
          }
          rows.push(row);
        }

        setEnrichedResult({
          columns,
          rows,
          row_count: rows.length,
          computedColumnNames: translatedColumns.map((c) => c.name),
          failedColumns: Object.keys(failedColumnsMap),
        });
      } catch (err) {
        setDuckDBError(err.message || String(err));
        setEnrichedResult(null);
      } finally {
        setDuckDBLoading(false);
      }
    };

    computeEnriched();
  }, [db, duckDBTableName, computedColumns, setEnrichedResult, setDuckDBLoading, setDuckDBError, setFailedComputedColumns]);

  // Helper: add a computed column from a metric/dimension definition
  const addComputedFromDefinition = useCallback(
    (item) => {
      if (!item?.name || !item?.config?.expression) return;

      useStore.getState().addExplorerComputedColumn({
        name: item.name,
        expression: item.config.expression,
        type: item.config.aggregation ? 'metric' : 'dimension',
        sourceDialect: sourceName ? undefined : undefined, // Will be set by caller if needed
      });
    },
    [sourceName]
  );

  return { addComputedFromDefinition };
};

export default useExplorerDuckDB;
