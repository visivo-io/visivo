import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '../../../stores/store';

/**
 * useDebouncedSave — VIS-802 / Track G G-1.
 *
 * A tiny auto-save engine for the right-rail Edit forms. There are no Save
 * buttons in the Workspace Edit surface (per G-1) — form changes are committed
 * automatically through a save action with a local debounce, and the form shows
 * an inline save-state indicator instead.
 *
 * NOTE: This is deliberately self-contained and does NOT depend on Track H's
 * `useAutoSave` (which does not exist yet). When Track H lands, the right rail
 * can migrate to it; the indicator states ('idle' | 'pending' | 'saving' |
 * 'saved' | 'error') are chosen to map cleanly onto it.
 *
 * @param {(payload:any)=>Promise<{success?:boolean,error?:string}>|any} saveFn
 *        The save action (e.g. `(name,config)=>saveDashboard(name,config)`,
 *        already closed over the object name by the caller).
 * @param {object} [opts]
 * @param {number} [opts.delay=500]  Debounce window in ms.
 * @returns {{ status: string, scheduleSave: (payload:any)=>void, saveNow: (payload:any)=>Promise<void>, reset: ()=>void }}
 *        - status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
 *        - scheduleSave(payload): debounce a save with the given payload.
 *        - saveNow(payload): flush immediately (cancels the pending timer).
 *        - reset(): clear the timer + return to 'idle' (call on selection change).
 *
 * A save still pending when the hook unmounts is FLUSHED (fire-and-forget),
 * not dropped — otherwise the user's last edits inside the debounce window
 * would be silently lost when switching selection / closing the rail. Use
 * `reset()` to intentionally discard a pending save.
 */
export default function useDebouncedSave(saveFn, opts = {}) {
  const { delay = 500 } = opts;
  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);
  const savedTimerRef = useRef(null);
  const saveFnRef = useRef(saveFn);
  // The payload of the currently pending (debounced, not yet fired) save, so
  // it can be FLUSHED — not dropped — if the hook unmounts inside the window.
  const pendingPayloadRef = useRef(null);
  // Track the latest mounted-ness so a resolved save after unmount doesn't
  // setState into a torn-down component.
  const mountedRef = useRef(true);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const runSave = useCallback(async payload => {
    if (mountedRef.current) setStatus('saving');
    // Report into the global save-activity counter (H-1) so the TopBar
    // cluster shows "Saving…" while this form's write is in flight. The
    // counter must balance even if this hook unmounts mid-save, so the
    // end call lives in `finally` and ignores `mountedRef`.
    const { beginSaveActivity, endSaveActivity } = useStore.getState();
    beginSaveActivity?.();
    let ok = false;
    try {
      const result = await saveFnRef.current(payload);
      // saveFn may return `{ success }` (the store actions do) or nothing.
      ok = !(result && result.success === false);
      if (!mountedRef.current) return;
      if (!ok) {
        setStatus('error');
        return;
      }
      setStatus('saved');
      // Drop back to idle after a beat so the "Saved" badge isn't sticky.
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus('idle');
      }, 2000);
    } catch {
      if (mountedRef.current) setStatus('error');
    } finally {
      endSaveActivity?.(ok);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        // Flush (fire-and-forget) rather than drop the pending payload so the
        // user's last edits aren't lost when the form unmounts inside the
        // debounce window (e.g. switching selection in the right rail).
        if (pendingPayloadRef.current) {
          const { payload } = pendingPayloadRef.current;
          pendingPayloadRef.current = null;
          runSave(payload);
        }
      }
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [runSave]);

  const scheduleSave = useCallback(
    payload => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setStatus('pending');
      pendingPayloadRef.current = { payload };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingPayloadRef.current = null;
        runSave(payload);
      }, delay);
    },
    [delay, runSave]
  );

  const saveNow = useCallback(
    async payload => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingPayloadRef.current = null;
      await runSave(payload);
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
    pendingPayloadRef.current = null;
    setStatus('idle');
  }, []);

  return { status, scheduleSave, saveNow, reset };
}
