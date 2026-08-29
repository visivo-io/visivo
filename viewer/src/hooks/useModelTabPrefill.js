import { useEffect, useRef } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { DEFAULT_RUN_ID } from '../constants';
import { processModel } from './useModelsData';
import { fetchModelJobs } from '../api/modelJobs';
import { getCachedExplorationResult } from '../stores/explorationResultCache';

/**
 * Fill a model tab that has no rows — from this session's own results first,
 * and only then from the last BUILD's parquet.
 *
 * Two sources, in that order, because they answer two different questions:
 *
 * 1. THIS SESSION'S RESULT (M27). Switching to another exploration tab parks
 *    the current one, and parking deliberately drops query results from the
 *    persisted draft (`explorerStore`'s snapshot/restore docstring) — so
 *    coming back used to mean re-running every query you had on screen.
 *    `explorationResultCache.js` keeps those rows for the life of the page,
 *    keyed by the exploration + chip + source + executed SQL, and this hook
 *    hands a hit back through `setModelQueryResult` — the same door a real run
 *    comes through, so `useExplorerDuckDB` re-registers the DuckDB table and
 *    computed columns / the column profiler keep working. A hit is synchronous
 *    and makes no network request at all.
 *
 * 2. THE LAST BUILD. Opening a model used to show an empty grid until you
 *    pressed Run, even though the previous run's parquet was sitting right
 *    there. `explorerStore` used to do this itself, and lost the ability when
 *    `api/modelData.js` was removed: the rows now come from the parquet via
 *    DuckDB, and DuckDB is reachable from a hook, not from a Zustand store.
 *
 * So it lives here rather than in the store. The alternative — exposing a
 * DuckDB singleton for the store to reach into — is smaller but puts a browser
 * resource behind a synchronous state container, where nothing owns its
 * lifecycle.
 *
 * Deliberately conservative:
 *
 * - It only fills a tab that has NO result. A query you just ran is never
 *   overwritten, by either source.
 * - The session cache is consulted every time (it is a Map lookup), but the
 *   BUILD is attempted at most once per model per mount, whether it succeeded
 *   or not. A model that has never been built has no parquet, and a 404 per
 *   keystroke is worse than an empty grid.
 * - A failure is silent. This is a convenience; the Run button is the
 *   authoritative path and reports its own errors.
 *
 * Loads the last build through the model-jobs endpoint (fetchModelJobs →
 * signed_data_file_url), the same path the dashboard uses, so it works in the
 * cloud as well as locally. A model that has no built data just leaves the grid
 * empty.
 *
 * @param {string|null} modelName - the active model tab, or null
 * @param {boolean} hasResult - whether that tab already has rows
 * @param {{explorationId?: string|null, sourceName?: string|null, sql?: string}} [cacheScope]
 *   The identity of the query this tab currently holds. Omit it (or leave
 *   `explorationId` empty) and the session cache is simply off — the hook then
 *   behaves exactly as it did before M27. `sourceName`/`sql` MUST describe the
 *   tab being asked about, not some other tab.
 */
export const useModelTabPrefill = (modelName, hasResult, cacheScope = null) => {
  const db = useDuckDB();
  const setModelQueryResult = useStore(state => state.setModelQueryResult);
  const projectId = useStore(state => state.project?.id);
  // Names already attempted this mount — keyed so switching tabs back and forth
  // doesn't re-fetch, and a model with no parquet is asked for exactly once.
  const attemptedRef = useRef(new Set());

  const explorationId = cacheScope?.explorationId || null;
  const scopeSourceName = cacheScope?.sourceName || null;
  const scopeSql = cacheScope?.sql || '';

  useEffect(() => {
    if (!modelName || hasResult) return undefined;

    // (1) This session's own result for exactly this query. Checked BEFORE the
    // last-build fetch and before `attemptedRef` is touched: it needs no
    // DuckDB handle, no network, and it is what the user was looking at a
    // moment ago, so it outranks whatever the project last built.
    const cached = getCachedExplorationResult({
      explorationId,
      modelName,
      sourceName: scopeSourceName,
      sql: scopeSql,
    });
    if (cached) {
      // `from_cache` marks the provenance for anything downstream that cares;
      // the rows themselves are exactly what the run produced.
      setModelQueryResult(modelName, { ...cached, from_cache: true });
      return undefined;
    }

    // (2) The last build's parquet.
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
  }, [
    db,
    modelName,
    hasResult,
    setModelQueryResult,
    projectId,
    explorationId,
    scopeSourceName,
    scopeSql,
  ]);
};

export default useModelTabPrefill;
