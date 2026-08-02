import { useEffect, useRef, useState } from 'react';
import useStore from '../../../../stores/store';
import { fetchModelColumnNames } from '../../../../api/modelSchema';

/**
 * useModelColumns — hydrate real column names for a set of models (VIS-1006a).
 *
 * The ERD model cards read `model.columns`, but the workspace `models` store
 * slice never populates that field (it carries config/sql/source, not the run
 * result's columns). So cards rendered "No columns loaded".
 *
 * This hook closes that gap by asking the server to INFER each model's output
 * columns (`POST /api/model-schemas/{name}/`, via `fetchModelColumnNames`).
 * Inference is SQLGlot against the source's cached schema — no query is re-run,
 * no table name is guessed from the SQL, and no database is touched.
 *
 * It used to read the artifact `visivo run` wrote, which meant a model nobody
 * had built yet showed "No columns loaded" no matter how valid its SQL was.
 * Inference does not depend on a run, so a freshly-written model card fills in.
 *
 * @param {string[]} modelNames - the model names to hydrate (the ERD's models).
 * @returns {{ columnsByModel: Record<string,string[]>, loading: boolean }}
 *   `columnsByModel[name]` is the model's column-name array (`[]` until loaded
 *   or when the model has no schema/data). Models already carrying a usable
 *   column list are reported as-is by the caller; this hook only fills gaps.
 */
export function useModelColumns(modelNames) {
  // Subscribed, not read via getState() inside the async callback below: that
  // would sample the id at request time rather than render time, and pulls the
  // store into a tick the effect doesn't own.
  const projectId = useStore(s => s.project?.id);
  const [columnsByModel, setColumnsByModel] = useState({});
  const [loading, setLoading] = useState(false);
  // Names whose fetch is in flight OR resolved — so re-renders (and a growing
  // model set) don't re-fetch. A name is added ONLY once its fetch resolves
  // (or starts) and is committed; crucially we never drop a resolved result on
  // effect cleanup, so React 18 StrictMode's mount→unmount→mount double-invoke
  // can't leave the columns permanently empty (the earlier bug: pre-marking +
  // cancelling on cleanup meant the only fetch that ran was discarded and the
  // second pass skipped fetching).
  const inFlightRef = useRef(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Stable key so the effect only re-runs when the SET of names changes, not on
  // every array identity churn from the parent's useMemo.
  const namesKey = Array.isArray(modelNames)
    ? [...new Set(modelNames.filter(Boolean))].sort().join('|')
    : '';

  useEffect(() => {
    const names = namesKey ? namesKey.split('|') : [];
    const toFetch = names.filter(n => !inFlightRef.current.has(n));
    if (toFetch.length === 0) return;

    toFetch.forEach(n => inFlightRef.current.add(n));
    setLoading(true);

    Promise.all(
      toFetch.map(async name => {
        try {
          // The schema artifact is the only source: small inline JSON, no
          // parquet read, and written by the same run that builds the data —
          // so a model with data has a schema.
          return [name, await fetchModelColumnNames(name, { projectId })];
        } catch {
          // A model that was never run resolves to no columns; the card keeps
          // its empty state rather than throwing.
          return [name, []];
        }
      })
    ).then(entries => {
      // Commit even across a StrictMode remount — a resolved result must never
      // be thrown away (that left the cards stuck on "No columns loaded").
      if (!mountedRef.current) return;
      setColumnsByModel(prev => {
        const next = { ...prev };
        entries.forEach(([name, cols]) => {
          next[name] = cols;
        });
        return next;
      });
      setLoading(false);
    });
  }, [namesKey, projectId]);

  return { columnsByModel, loading };
}

export default useModelColumns;
