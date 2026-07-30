import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wrap an async handler with a synchronous double-invoke guard + a `pending`
 * flag.
 *
 * `disabled={pending}` alone is NOT a sufficient double-click guard: a real
 * double-click can dispatch both click events before React re-renders the
 * button disabled (the VIS-1084/VIS-1086 bug class). A synchronous in-flight
 * ref rejects the second call immediately; `pending` still drives the button's
 * disabled/spinner state for the UI.
 *
 * The returned `run` has a STABLE identity (safe to pass as an onClick without
 * causing re-renders) and always calls the LATEST `fn`, so a handler closing
 * over changing props/state stays correct without re-subscribing.
 *
 * @param {(...args:any[])=>Promise<any>} fn the async work to guard
 * @returns {[ (...args:any[])=>Promise<any>, boolean ]} `[run, pending]`
 */
export function useGuardedAsync(fn) {
  const inFlightRef = useRef(false);
  const [pending, setPending] = useState(false);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (...args) => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setPending(true);
    try {
      return await fnRef.current(...args);
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, []);

  return [run, pending];
}

export default useGuardedAsync;
