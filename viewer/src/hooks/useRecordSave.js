import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '../stores/store';
import { COLLECTION_KEY, SAVE_ACTION } from '../components/views/workspace/collectionKeys';
import { unwrapConfig } from '../components/views/workspace/unwrapRecordConfig';
import {
  validateRecordConfig,
  validateRecordConfigSync,
} from '../components/views/workspace/validateAgainstSchema';
import { checkRefTargets } from '../components/views/workspace/refPreflight';
import { checkExpressions } from '../components/views/workspace/expressionPreflight';

/**
 * Cloud read-only probe (VIS-1025). `capabilities` is null/undefined under
 * local serve (always editable); in cloud it's the stage's capability object
 * and `can_edit === false` holds every write.
 */
const isReadOnly = state => {
  const caps = state.capabilities;
  return !!(caps && caps.can_edit === false);
};

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
 * VALIDATION GATE (VIS-993): persistence is gated by the $defs schema
 * (validateAgainstSchema) plus the dangling-ref pre-flight (refPreflight).
 * Under runs-on-changes every persisted data-resource save fires a real DAG
 * run — and in cloud a failed run 409-blocks Commit — so an invalid config is
 * never handed to `saveX`: the optimistic store write still happens (bound
 * surfaces stay live while the user types), but nothing POSTs, no run fires,
 * and the hook reports `status: 'invalid'` with per-field `errors`. A sync
 * fast path inside `scheduleSave` marks errors the moment the user stops
 * typing; the async fire-time check remains the authoritative gate.
 *
 * READ-ONLY SHORT-CIRCUIT (VIS-1025): `capabilities` (branchingStore) is null
 * under local serve (always editable) and an object in cloud, where
 * `can_edit: false` marks the stage read-only. The check runs BEFORE the
 * optimistic write AND before the validation gate — a not-allowed edit is not
 * 'invalid' (no error churn for a viewer-only user): nothing writes, nothing
 * persists, and the hook reports `status: 'readonly'` with `errors: null`.
 *
 * The status model ('idle' | 'pending' | 'saving' | 'saved' | 'error' |
 * 'invalid' | 'readonly') and the `{ status, errors, scheduleSave, saveNow,
 * reset }` surface extend `useDebouncedSave` so existing indicators map
 * straight across.
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
  // Validation errors ({path, message, keyword}[]) when status === 'invalid'.
  const [errors, setErrors] = useState(null);
  const timerRef = useRef(null);
  const savedTimerRef = useRef(null);
  // Mirror the latest type/name in refs so the fire-time persist always targets
  // the hook's CURRENT open record (read from refs, not the closure that
  // scheduled the timer).
  const typeRef = useRef(type);
  const nameRef = useRef(name);
  const mountedRef = useRef(true);
  // The most recent config handed to scheduleSave/saveNow, plus a monotonic
  // sequence number bumped on every edit. Together they let runSave detect that
  // a NEWER edit landed while a save was in flight (see the re-apply guard in
  // runSave) and recover the user's latest keystroke from a refetch revert.
  const latestConfigRef = useRef(undefined);
  const seqRef = useRef(0);

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
    // Snapshot the edit sequence at fire time. If it advances while saveFn is in
    // flight, a newer edit arrived during the round-trip.
    const seqAtFire = seqRef.current;
    const saveActionName = SAVE_ACTION[t];
    const state = useStore.getState();

    // VIS-1025 fire-time hold — BEFORE validation (not-allowed is not
    // 'invalid'). Catches timers armed before capabilities flipped read-only.
    if (isReadOnly(state)) {
      if (mountedRef.current) {
        setStatus('readonly');
        setErrors(null);
      }
      return { success: false, readonly: true };
    }

    const saveFn = saveActionName ? state[saveActionName] : null;

    // Read the CURRENT optimistic value at FIRE time (clobber-safety).
    const config = readCurrentConfig();

    if (typeof saveFn !== 'function' || config === undefined) {
      if (mountedRef.current) setStatus('error');
      return { success: false };
    }

    // VIS-993 gate — authoritative fire-time check. Runs BEFORE the global
    // save-activity tick: a blocked edit is not a save in flight. Three
    // layers, cheapest first: $defs schema → dangling refs → SQL parse of
    // expression fields (backend sqlglot; async-only, fail-open off-server).
    // FAIL-OPEN on a gate CRASH (canvas-persist regression): an internal gate
    // error must never swallow the persist — only a real invalid VERDICT
    // blocks; the backend Pydantic validator stays authoritative either way.
    // ALL THREE layers run inside ONE try/catch — a throw from ANY of them
    // (validateRecordConfig's AJV, a malformed config walked by checkRefTargets,
    // or checkExpressions' network layer) must fail open, not escape runSave and
    // silently swallow the persist. Each layer only runs while `blocked` is
    // still null, so the catch can only ever fire pre-verdict: a real invalid
    // VERDICT is never erased by a later-layer crash.
    let blocked = null;
    try {
      const validation = await validateRecordConfig(t, config);
      if (!validation.valid) blocked = validation;
      if (!blocked) {
        const refCheck = checkRefTargets(config, useStore.getState());
        if (!refCheck.valid) blocked = refCheck;
      }
      if (!blocked) {
        const exprCheck = await checkExpressions(t, config);
        if (!exprCheck.valid) blocked = exprCheck;
      }
    } catch (err) {
      console.error('useRecordSave: validation gate crashed — failing open', err);
      blocked = null;
    }
    if (blocked) {
      if (mountedRef.current) {
        setStatus('invalid');
        setErrors(blocked.errors);
      }
      return { success: false, validation: blocked };
    }
    if (mountedRef.current) setErrors(null);

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
      // Refetch-revert recovery (VIS-1018 adversarial-review fix): the type's
      // `saveX` action refetches its collection after the write and blind-replaces
      // it with the server value. If the user typed a newer edit WHILE this save
      // was in flight, that optimistic write was just stomped back to server-stale
      // data — and the pending debounced persist would then read the reverted
      // value. Detect the newer edit (seq advanced) and re-apply the latest
      // optimistic config so the next fire-time read sees the user's newest edit.
      if (seqRef.current !== seqAtFire && latestConfigRef.current !== undefined) {
        useStore.getState().updateRecordConfigOptimistic?.(t, n, latestConfigRef.current);
      }
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
      // VIS-1025 read-only short-circuit — BEFORE the optimistic write and
      // BEFORE validation: nothing writes, nothing arms, no 'invalid' churn.
      if (isReadOnly(useStore.getState())) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setStatus('readonly');
        setErrors(null);
        return;
      }
      // Record this as the latest edit (used by runSave's refetch-revert guard).
      latestConfigRef.current = nextConfig;
      seqRef.current += 1;
      // Optimistic write first so every bound surface reflects the edit now —
      // even a blocked edit stays visible while the user finishes typing; only
      // PERSISTENCE is gated.
      useStore.getState().updateRecordConfigOptimistic?.(typeRef.current, nameRef.current, nextConfig);

      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

      // VIS-993 sync fast path: when the schema is already loaded, mark the
      // edit invalid immediately and HOLD the timer — no doomed persist gets
      // armed. Returns null pre-load, in which case the async fire-time gate
      // in runSave stays authoritative.
      const syncCheck = validateRecordConfigSync(typeRef.current, nextConfig);
      const syncBlocked =
        syncCheck && !syncCheck.valid
          ? syncCheck
          : (() => {
              const refCheck = checkRefTargets(nextConfig, useStore.getState());
              return refCheck.valid ? null : refCheck;
            })();
      if (syncBlocked) {
        setStatus('invalid');
        setErrors(syncBlocked.errors);
        return;
      }
      setErrors(null);

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
      // VIS-1025 read-only short-circuit — mirror scheduleSave: no optimistic
      // write, no persist, status 'readonly' (runSave would also hold, but the
      // early return keeps the blocked config out of latestConfigRef too).
      if (isReadOnly(useStore.getState())) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setStatus('readonly');
        setErrors(null);
        return { success: false, readonly: true };
      }
      // When called with a config, apply it optimistically first so the persist
      // reads it; called bare, it just flushes the current optimistic value.
      if (nextConfig !== undefined) {
        latestConfigRef.current = nextConfig;
        seqRef.current += 1;
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
    setErrors(null);
  }, []);

  return { status, errors, scheduleSave, saveNow, reset };
}
