import { useEffect, useMemo, useRef } from 'react';
import useStore from '../../../stores/store';
import { COLLECTION_KEY } from './collectionKeys';

/**
 * useCanvasRecord(type, name) — the "subscribe to the type's collection →
 * fetch-if-empty → find by name → unwrap `config`" pattern every per-object
 * canvas body re-implemented, extracted once (VIS-1001).
 *
 * The store's fetch action for a collection is `fetch` + PascalCase of the
 * collection key (e.g. `charts` → `fetchCharts`, `csvScriptModels` →
 * `fetchCsvScriptModels`), matching the store slices (which also expose a
 * `<collection>Loading` flag consumed here).
 *
 * @returns {{ record: object|null, config: object|null, status: 'loading'|'not-found'|'ready' }}
 */
export function useCanvasRecord(type, name) {
  const collectionKey = COLLECTION_KEY[type] || null;
  const fetchKey = collectionKey
    ? `fetch${collectionKey[0].toUpperCase()}${collectionKey.slice(1)}`
    : null;

  const collection = useStore(s => (collectionKey ? s[collectionKey] : null));
  const fetchFn = useStore(s => (fetchKey ? s[fetchKey] : null));
  const loading = useStore(s => (collectionKey ? !!s[`${collectionKey}Loading`] : false));

  // One fetch attempt per collection. The slices write a FRESH array on every
  // fetch — even an empty result — so gating the fetch on emptiness alone
  // re-fires the effect forever when the project has zero objects of the type.
  const fetchedKeysRef = useRef(new Set());
  const fetchAttempted = collectionKey ? fetchedKeysRef.current.has(collectionKey) : false;
  useEffect(() => {
    if (!collectionKey || fetchedKeysRef.current.has(collectionKey)) return;
    if ((!collection || collection.length === 0) && typeof fetchFn === 'function') {
      fetchedKeysRef.current.add(collectionKey);
      fetchFn();
    }
  }, [collectionKey, collection, fetchFn]);

  const record = useMemo(
    () => (Array.isArray(collection) ? collection.find(r => r.name === name) || null : null),
    [collection, name]
  );

  const config = useMemo(
    () => (record ? { name: record.name, ...(record.config || record) } : null),
    [record]
  );

  const status = useMemo(() => {
    if (!collectionKey) return 'not-found'; // unknown type
    if (record) return 'ready';
    if (!Array.isArray(collection)) return 'loading'; // not fetched yet
    if (collection.length > 0) return 'not-found';
    // Empty collection: loading until our fetch attempt has settled; after
    // that an empty result is terminal ('not-found'), not a refetch trigger.
    return loading || !fetchAttempted ? 'loading' : 'not-found';
  }, [collectionKey, collection, record, loading, fetchAttempted]);

  return { record, config, status };
}

export default useCanvasRecord;
