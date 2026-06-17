import { useEffect, useMemo } from 'react';
import useStore from '../../../stores/store';
import { COLLECTION_KEY } from './collectionKeys';

/**
 * useCanvasRecord(type, name) — the "subscribe to the type's collection →
 * fetch-if-empty → find by name → unwrap `config`" pattern every per-object
 * canvas body re-implemented, extracted once (VIS-1001).
 *
 * The store's fetch action for a collection is `fetch` + PascalCase of the
 * collection key (e.g. `charts` → `fetchCharts`, `csvScriptModels` →
 * `fetchCsvScriptModels`), matching the store slices.
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

  useEffect(() => {
    if ((!collection || collection.length === 0) && typeof fetchFn === 'function') {
      fetchFn();
    }
  }, [collection, fetchFn]);

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
    return collection.length === 0 ? 'loading' : 'not-found';
  }, [collectionKey, collection, record]);

  return { record, config, status };
}

export default useCanvasRecord;
