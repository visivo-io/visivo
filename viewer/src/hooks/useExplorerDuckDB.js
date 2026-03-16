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
 * Single-pipeline architecture:
 * 1. When queryResult or computedColumns change, run the full pipeline
 * 2. Load data into DuckDB table
 * 3. If computed columns exist, translate + compute enriched result
 * 4. Uses a version counter to discard stale results from superseded runs
 */
const useExplorerDuckDB = () => {
  const db = useDuckDB();
  const queryResult = useStore((s) => s.explorerQueryResult);
  const computedColumns = useStore((s) => s.explorerComputedColumns);
  const setDuckDBLoading = useStore((s) => s.setExplorerDuckDBLoading);
  const setDuckDBError = useStore((s) => s.setExplorerDuckDBError);
  const setEnrichedResult = useStore((s) => s.setExplorerEnrichedResult);
  const setFailedComputedColumns = useStore((s) => s.setExplorerFailedComputedColumns);

  const versionRef = useRef(0);
  const tableCounterRef = useRef(0);
  const currentTableRef = useRef(null);

  useEffect(() => {
    if (!db || !queryResult?.rows?.length || !queryResult?.columns?.length) {
      return;
    }

    versionRef.current += 1;
    const thisVersion = versionRef.current;

    const runPipeline = async () => {
      setDuckDBLoading(true);
      setDuckDBError(null);
      setFailedComputedColumns({});

      try {
        // Step 1: Load query results into a DuckDB table
        tableCounterRef.current += 1;
        const tableName = `${EXPLORER_TABLE_PREFIX}${tableCounterRef.current}`;
        const conn = await getConnection(db);

        // Drop previous table
        if (currentTableRef.current) {
          try {
            await conn.query(`DROP TABLE IF EXISTS "${currentTableRef.current}"`);
          } catch {
            // Ignore drop errors
          }
        }

        const jsonData = JSON.stringify(queryResult.rows);
        const tempFile = `explorer_data_${Date.now()}.json`;
        await db.registerFileText(tempFile, jsonData);
        await conn.query(`
          CREATE TABLE "${tableName}" AS
          SELECT * FROM read_json_auto('${tempFile}')
        `);
        await db.dropFile(tempFile);
        currentTableRef.current = tableName;

        // Discard if a newer pipeline run started
        if (thisVersion !== versionRef.current) return;

        // Step 2: If no computed columns, we're done
        if (computedColumns.length === 0) {
          setEnrichedResult(null);
          return;
        }

        // Step 3: Translate expressions to DuckDB dialect if needed
        const needsTranslation = computedColumns.filter((c) => c.sourceDialect);
        let translatedColumns;

        if (needsTranslation.length > 0) {
          const { translations } = await translateExpressions(
            needsTranslation.map((c) => ({
              name: c.name,
              expression: c.expression,
              type: c.type,
            })),
            needsTranslation[0].sourceDialect
          );

          if (thisVersion !== versionRef.current) return;

          const translationMap = new Map(
            translations.map((t) => [t.name, t.duckdb_expression])
          );
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

        // Step 4: Build and execute SELECT with computed columns
        const buildSelectPart = (col) => {
          if (col.type === 'metric') {
            return `${col.duckdbExpression} OVER () AS "${col.name}"`;
          }
          return `${col.duckdbExpression} AS "${col.name}"`;
        };

        const computedSelectParts = translatedColumns.map(buildSelectPart);
        let sql = `SELECT *, ${computedSelectParts.join(', ')} FROM "${tableName}"`;
        let result;
        const failedColumnsMap = {};

        try {
          result = await runDuckDBQuery(db, sql);
        } catch {
          // Full query failed — test each computed column individually
          const workingParts = [];
          for (const col of translatedColumns) {
            const testSql = `SELECT ${buildSelectPart(col)} FROM "${tableName}" LIMIT 1`;
            try {
              await runDuckDBQuery(db, testSql);
              workingParts.push(buildSelectPart(col));
            } catch (colErr) {
              failedColumnsMap[col.name] = colErr.message || String(colErr);
              workingParts.push(`NULL AS "${col.name}"`);
            }
          }
          sql = `SELECT *, ${workingParts.join(', ')} FROM "${tableName}"`;
          result = await runDuckDBQuery(db, sql);
        }

        if (thisVersion !== versionRef.current) return;

        if (Object.keys(failedColumnsMap).length > 0) {
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
        if (thisVersion !== versionRef.current) return;
        setDuckDBError(err.message || String(err));
        setEnrichedResult(null);
      } finally {
        if (thisVersion === versionRef.current) {
          setDuckDBLoading(false);
        }
      }
    };

    runPipeline();
  }, [db, queryResult, computedColumns, setEnrichedResult, setDuckDBLoading, setDuckDBError, setFailedComputedColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: add a computed column from a metric/dimension definition
  const addComputedFromDefinition = useCallback(
    (item) => {
      if (!item?.name || !item?.config?.expression) return;

      useStore.getState().addExplorerComputedColumn({
        name: item.name,
        expression: item.config.expression,
        type: item.config.aggregation ? 'metric' : 'dimension',
        sourceDialect: undefined,
      });
    },
    []
  );

  return { addComputedFromDefinition };
};

export default useExplorerDuckDB;
