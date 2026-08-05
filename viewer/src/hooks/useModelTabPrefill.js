import { useEffect, useRef } from 'react';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { DEFAULT_RUN_ID } from '../constants';
import { processModel } from './useModelsData';
import { fetchModelJobs } from '../api/modelJobs';

/**
 * Fill a freshly-opened model tab with the LAST RUN's rows.
 *
 * Opening a model used to show an empty grid until you pressed Run, even though
 * the previous run's parquet was sitting right there. `explorerStore` used to do
 * this itself, and lost the ability when `api/modelData.js` was removed: the
 * rows now come from the parquet via DuckDB, and DuckDB is reachable from a
 * hook, not from a Zustand store.
 *
 * So it lives here rather than in the store. The alternative — exposing a DuckDB
 * singleton for the store to reach into — is smaller but puts a browser resource
 * behind a synchronous state container, where nothing owns its lifecycle.
 *
 * Deliberately conservative:
 *
 * - It only fills a tab that has NO result. A query you just ran is never
 *   overwritten by a stale build.
 * - It attempts each model at most once per mount, whether it succeeded or not.
 *   A model that has never been built has no parquet, and a 404 per keystroke
 *   is worse than an empty grid.
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
 */
export const useModelTabPrefill = (modelName, hasResult) => {
  const db = useDuckDB();
  const setModelQueryResult = useStore(state => state.setModelQueryResult);
  const projectId = useStore(state => state.project?.id);
  // Names already attempted this mount — keyed so switching tabs back and forth
  // doesn't re-fetch, and a model with no parquet is asked for exactly once.
  const attemptedRef = useRef(new Set());

  useEffect(() => {
    if (!db || !modelName || hasResult) return;
    if (attemptedRef.current.has(modelName)) return;
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
