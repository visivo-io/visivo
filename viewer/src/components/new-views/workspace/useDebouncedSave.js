import { useCallback, useEffect, useRef, useState } from 'react';

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
 */
export default function useDebouncedSave(saveFn, opts = {}) {
  const { delay = 500 } = opts;
  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);
  const savedTimerRef = useRef(null);
  const saveFnRef = useRef(saveFn);
  // Track the latest mounted-ness so a resolved save after unmount doesn't
  // setState into a torn-down component.
  const mountedRef = useRef(true);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const runSave = useCallback(async payload => {
    if (mountedRef.current) setStatus('saving');
    try {
      const result = await saveFnRef.current(payload);
      if (!mountedRef.current) return;
      // saveFn may return `{ success }` (the store actions do) or nothing.
      if (result && result.success === false) {
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
    }
  }, []);

  const scheduleSave = useCallback(
    payload => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setStatus('pending');
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
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
    setStatus('idle');
  }, []);

  return { status, scheduleSave, saveNow, reset };
}
