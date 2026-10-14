import { useEffect, useRef } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { DEFAULT_RUN_ID } from '../constants';
import { processModel } from './useModelsData';
import { fetchModelJobs } from '../api/modelJobs';
import { getCachedExplorationResult } from '../stores/explorationResultCache';

/**
 * Fill a model tab that has no rows: first from this session's cached result
 * for exactly this query (`explorationResultCache`), then from the last build's
 * parquet.
 *
 * `explorerStore` used to do the parquet prefill itself and lost the ability
 * when `api/modelData.js` was removed: the rows now come from the parquet via
 * DuckDB, and DuckDB is reachable from a hook, not from a Zustand store.
 *
 * Deliberately conservative:
 *
 * - It only fills a tab that has no result. A query you just ran is never
 *   overwritten by either source.
 * - The build is attempted at most once per model per mount, whether it
 *   succeeded or not. A model that has never been built has no parquet, and a
 *   404 per keystroke is worse than an empty grid.
 * - A failure is silent. The Run button is the authoritative path and reports
 *   its own errors.
 *
 * The cache read and the build fetch are separate effects on purpose. The
 * cache read must re-fire when the scope (source, SQL) changes; the build
 * fetch must not, because its cleanup cancels the in-flight request while
 * `attemptedRef` refuses to start another, which would leave the grid empty
 * for the rest of the mount. `servedFromCacheRef` stops the build effect from
 * racing a cache hit on the same commit.
 *
 * @param {string|null} modelName - the active model tab, or null
 * @param {boolean} hasResult - whether that tab already has rows
 * @param {{explorationId?: string|null, sourceName?: string|null, sql?: string}} [cacheScope]
 *   Identity of the query this tab holds. Without an `explorationId` the
 *   session cache is off and only the build prefill runs.
 */
export const useModelTabPrefill = (modelName, hasResult, cacheScope = null) => {
  const db = useDuckDB();
  const setModelQueryResult = useStore(state => state.setModelQueryResult);
  const projectId = useStore(state => state.project?.id);
  // Names already attempted this mount — keyed so switching tabs back and forth
  // doesn't re-fetch, and a model with no parquet is asked for exactly once.
  const attemptedRef = useRef(new Set());
  // Model the cache effect just served, so the build effect skips it this commit.
  const servedFromCacheRef = useRef(null);

  const explorationId = cacheScope?.explorationId || null;
  const scopeSourceName = cacheScope?.sourceName || null;
  const scopeSql = cacheScope?.sql || '';

  // Session cache first: synchronous, no DuckDB handle, no network.
  useEffect(() => {
    if (!modelName || hasResult) return;

    const cached = getCachedExplorationResult({
      explorationId,
      modelName,
      sourceName: scopeSourceName,
      sql: scopeSql,
    });
    if (!cached) {
      servedFromCacheRef.current = null;
      return;
    }
    servedFromCacheRef.current = modelName;
    // Provenance only; nothing reads `from_cache` yet (same as `from_last_run`).
    setModelQueryResult(modelName, { ...cached, from_cache: true });
  }, [modelName, hasResult, setModelQueryResult, explorationId, scopeSourceName, scopeSql]);

  // Last build's parquet. Not scope-dependent (see the docstring).
  useEffect(() => {
    if (!modelName || hasResult) return undefined;
    if (servedFromCacheRef.current === modelName) return undefined;

    if (!db) return undefined;
    if (attemptedRef.current.has(modelName)) return undefined;
    attemptedRef.current.add(modelName);

    let cancelled = false;

    (async () => {
      try {
        const jobs = await fetchModelJobs([modelName], { projectId, runId: DEFAULT_RUN_ID });
        const job = jobs.find(j => j.name === modelName);
        // No built data for this model — leave the grid empty.
        if (cancelled || !job?.signed_data_file_url) return;

        const loaded = await processModel(db, job);
        const entry = loaded?.[modelName];
        const rows = entry?.data;
        // `processModel` reports a per-model failure as an `error` key rather
        // than throwing, so an empty or errored result is not a prefill.
        if (cancelled || entry?.error || !Array.isArray(rows) || rows.length === 0) return;

        setModelQueryResult(modelName, {
          columns: Object.keys(rows[0]),
          rows,
          row_count: rows.length,
          // Marks the grid as showing the last build rather than a query the
          // user just ran, so the UI can say so if it wants to.
          from_last_run: true,
        });
      } catch {
        // Convenience only — the Run button owns error reporting.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, modelName, hasResult, setModelQueryResult, projectId]);
};

export default useModelTabPrefill;
