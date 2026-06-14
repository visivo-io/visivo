import { useEffect, useRef, useState } from 'react';
import { fetchModelData } from '../../../../api/modelData';

/**
 * useModelColumns — hydrate real column names for a set of models (VIS-1006a).
 *
 * The ERD model cards read `model.columns`, but the workspace `models` store
 * slice never populates that field (it carries config/sql/source, not the run
 * result's columns). So cards rendered "No columns loaded".
 *
 * This hook closes that gap by fetching each model's PRE-COMPUTED data
 * (`/api/models/{name}/data/`, exposed via `fetchModelData`) — the same cached
 * run artifact the Explorer reads — and extracting its `columns` list. That
 * endpoint is the most reliable column source: it reflects the model's actual
 * output schema (post-SQL, post-join) without re-running the query or guessing
 * a table name from the SQL. It returns `{ available, columns }`; we keep only
 * the names.
 *
 * @param {string[]} modelNames - the model names to hydrate (the ERD's models).
 * @returns {{ columnsByModel: Record<string,string[]>, loading: boolean }}
 *   `columnsByModel[name]` is the model's column-name array (`[]` until loaded
 *   or when the model has no cached data). Models already carrying a usable
 *   column list are reported as-is by the caller; this hook only fills gaps.
 */
export function useModelColumns(modelNames) {
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
          const data = await fetchModelData(name);
          const cols = Array.isArray(data?.columns) ? data.columns.filter(Boolean) : [];
          return [name, cols];
        } catch {
          // A model with no cached data (never run) just resolves to no columns;
          // the card keeps its empty state rather than throwing.
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
  }, [namesKey]);

  return { columnsByModel, loading };
}

export default useModelColumns;
