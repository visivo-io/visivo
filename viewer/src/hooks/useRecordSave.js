import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '../stores/store';
import { COLLECTION_KEY, SAVE_ACTION } from '../components/new-views/workspace/collectionKeys';
import { unwrapConfig } from '../components/new-views/workspace/unwrapRecordConfig';

/**
 * useRecordSave(type, name, opts) — the unified optimistic + debounced save
 * backbone for editing surfaces (VIS-1018 step 1).
 *
 * Generalises the dashboard pattern (`updateDashboardConfigOptimistic` +
 * debounced `saveDashboard`, formerly stitched together by hand) to EVERY
 * object type, retiring the per-type `useObjectSave` switch. One instance per
 * open record.
 *
 *   scheduleSave(nextConfig):
 *     1. OPTIMISTICALLY writes `nextConfig` into the record's store collection
 *        immediately (`updateRecordConfigOptimistic`), so the canvas, Outline,
 *        and any other surface bound to that record reflect the edit before the
 *        backend round-trip — and so concurrent surfaces read each other's
 *        latest edit.
 *     2. Debounce-persists. CRITICAL (clobber-safety): when the debounce timer
 *        fires, the persist reads the CURRENT optimistic config out of the
 *        store (NOT the `nextConfig` captured when the timer was scheduled) and
 *        hands THAT to the type's `saveX` action. Two surfaces editing the same
 *        record therefore converge on the last write rather than racing stale
 *        closures back over each other.
 *
 * The status model ('idle' | 'pending' | 'saving' | 'saved' | 'error') and the
 * `{ status, scheduleSave, saveNow, reset }` surface mirror `useDebouncedSave`
 * so existing indicators map straight across.
 *
 * @param {string} type  one of the canonical object types (see COLLECTION_KEY).
 * @param {string} name  the record name (the collection key + persist arg).
 * @param {object} [opts]
 * @param {number} [opts.delay=500]  debounce window in ms.
 * @returns {{ status: string, scheduleSave: (nextConfig:object)=>void, saveNow: (nextConfig?:object)=>Promise<void>, reset: ()=>void }}
 */
export default function useRecordSave(type, name, opts = {}) {
  const { delay = 500 } = opts;
  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);
  const savedTimerRef = useRef(null);
  // Mirror the latest type/name in refs so the fire-time persist always targets
  // the hook's CURRENT open record (read from refs, not the closure that
  // scheduled the timer).
  const typeRef = useRef(type);
  const nameRef = useRef(name);
  const mountedRef = useRef(true);

  useEffect(() => {
    typeRef.current = type;
    nameRef.current = name;
  }, [type, name]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  /**
   * Read the record's CURRENT optimistic config straight out of the live store
   * collection (envelope-or-bare unwrapped). This is what makes concurrent
   * surfaces converge — we never persist a stale captured config.
   */
  const readCurrentConfig = useCallback(() => {
    const t = typeRef.current;
    const n = nameRef.current;
    const collectionKey = COLLECTION_KEY[t];
    if (!collectionKey) return undefined;
    const list = useStore.getState()[collectionKey] || [];
    const entry = list.find(r => r.name === n);
    return entry ? unwrapConfig(entry) : undefined;
  }, []);

  const runSave = useCallback(async () => {
    const t = typeRef.current;
    const n = nameRef.current;
    const saveActionName = SAVE_ACTION[t];
    const state = useStore.getState();
    const saveFn = saveActionName ? state[saveActionName] : null;

    // Read the CURRENT optimistic value at FIRE time (clobber-safety).
    const config = readCurrentConfig();

    if (typeof saveFn !== 'function' || config === undefined) {
      if (mountedRef.current) setStatus('error');
      return { success: false };
    }

    if (mountedRef.current) setStatus('saving');
    // Report into the global save-activity counter (H-1) so the TopBar shows
    // "Saving…" while this write is in flight. The counter must balance even
    // if this hook unmounts mid-save, so the end call lives in `finally` and
    // ignores `mountedRef`.
    const { beginSaveActivity, endSaveActivity } = state;
    beginSaveActivity?.();
    let ok = false;
    let result;
    try {
      result = await saveFn(n, config);
      ok = !(result && result.success === false);
      if (!mountedRef.current) return result;
      if (!ok) {
        setStatus('error');
        return result;
      }
      setStatus('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus('idle');
      }, 2000);
      return result;
    } catch (err) {
      if (mountedRef.current) setStatus('error');
      return { success: false, error: err?.message };
    } finally {
      endSaveActivity?.(ok);
    }
  }, [readCurrentConfig]);

  const scheduleSave = useCallback(
    nextConfig => {
      // Optimistic write first so every bound surface reflects the edit now.
      useStore.getState().updateRecordConfigOptimistic?.(typeRef.current, nameRef.current, nextConfig);

      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setStatus('pending');
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runSave();
      }, delay);
    },
    [delay, runSave]
  );

  const saveNow = useCallback(
    async nextConfig => {
      // When called with a config, apply it optimistically first so the persist
      // reads it; called bare, it just flushes the current optimistic value.
      if (nextConfig !== undefined) {
        useStore
          .getState()
          .updateRecordConfigOptimistic?.(typeRef.current, nameRef.current, nextConfig);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return runSave();
    },
    [runSave]
  );

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    setStatus('idle');
  }, []);

  return { status, scheduleSave, saveNow, reset };
}
