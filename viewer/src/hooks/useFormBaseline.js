import { useCallback, useEffect, useRef, useState } from 'react';
import isEqual from 'lodash/isEqual';
import { restoreDraft, syncDraft } from '../utils/formDrafts';

/**
 * Track a form's last-saved values so it can report dirtiness, revert, and
 * KEEP its unsaved edits when the user navigates away or reloads.
 *
 * The right rail's Cancel button was `() => {}` — modal-dismiss plumbing that
 * was stubbed out when the forms moved into the persistent rail and never
 * replaced. Making it Discard needs something to discard *to*, and no leaf
 * form retained one: each seeds plain `useState` from its record and keeps no
 * copy of the seed.
 *
 * **Snapshot the form's own state values, not its built config.** The forms
 * normalise on save (`formatRef`, trimming, omitting empty `layout`/`seeds`,
 * the chart's ref/embedded interleave rebuild), so diffing `buildConfig()`
 * against the stored record reports a freshly-loaded form as dirty on arrival.
 *
 * The baseline advances by itself after a save: the rail persists through
 * `useRecordSave.saveNow`, whose `updateRecordConfigOptimistic` replaces the
 * collection entry with a NEW object, so the form's `[record]`-keyed seeding
 * effect re-runs and calls `seed` again. Same mechanism that re-seeds when the
 * user switches to a different record.
 *
 * ### Draft persistence (`draftKey`)
 *
 * Pass a stable per-object key (`chart:revenue`) and the form's unsaved values
 * are mirrored to localStorage and restored the next time that object seeds —
 * so clicking away and back, or reloading, no longer discards edits. The rail
 * still destroys the form on every object switch; the draft is what survives.
 *
 * Only STANDALONE, named records in edit mode should pass a key — create-mode
 * and embedded forms have no stable identity to key on, so they pass undefined
 * and behave exactly as before. See `utils/formDrafts` for the staleness rule
 * (a draft is dropped when the saved record moved on) and the failure rule
 * (any load error clears that object's draft).
 *
 * @param {(values: object) => void} apply - push a value set into form state.
 *   Setters are stable, so this can safely be a `useCallback(..., [])`.
 * @param {string} [draftKey] - stable per-object key for draft persistence.
 *   Omit to disable persistence for this form instance.
 */
export default function useFormBaseline(apply, draftKey) {
  const [baseline, setBaseline] = useState(null);

  // The values the form last rendered with, captured by `isDirtyAgainst` (which
  // every consumer calls each render with exactly those values) so the sync
  // effect below can mirror them without changing the hook's call signature.
  // Written during render on purpose — it is a pure derivation of this render,
  // read only afterwards, in an effect.
  const latestValuesRef = useRef(undefined);
  // Last state written for this key, so a re-render that changed nothing the
  // draft cares about does not touch storage.
  const lastSyncedRef = useRef(null);

  /**
   * Seed form state AND record it as the clean baseline. When a draft for this
   * object is still valid (its baseline matches these saved values), the form
   * is seeded with the DRAFT instead — the user's unsaved edits come back —
   * while the baseline stays the saved values, so dirty/Discard keep pointing
   * at the last save.
   */
  const seed = useCallback(
    values => {
      setBaseline(values);
      const restored = draftKey ? restoreDraft(draftKey, values) : values;
      latestValuesRef.current = restored;
      apply(restored);
    },
    [apply, draftKey]
  );

  /** Put every field back to the baseline. No-op before the first seed. */
  const discard = useCallback(() => {
    if (baseline) apply(baseline);
  }, [baseline, apply]);

  /**
   * Deep-compare the current values against the baseline. Reports clean until
   * the first seed, so a form mid-mount never flashes its buttons enabled.
   */
  const isDirtyAgainst = useCallback(
    values => {
      latestValuesRef.current = values;
      return baseline !== null && !isEqual(values, baseline);
    },
    [baseline]
  );

  // Mirror the form's unsaved values to storage after each render: stored while
  // they differ from the baseline, removed once they match again (a save
  // advanced the baseline, or Discard reverted). No dep array — the values are
  // read from the ref the render just wrote — with a signature guard so an
  // unrelated re-render is not a storage write.
  useEffect(() => {
    if (!draftKey || baseline === null) return;
    const values = latestValuesRef.current;
    if (values === undefined) return;
    let signature;
    try {
      signature = JSON.stringify([baseline, values]);
    } catch {
      signature = null; // unserialisable — let syncDraft's own guard handle it
    }
    if (signature !== null && signature === lastSyncedRef.current) return;
    lastSyncedRef.current = signature;
    syncDraft(draftKey, baseline, values);
  });

  // Switching objects (or leaving create mode) must not carry the previous
  // key's write-guard forward, or the first sync for the new object can be
  // skipped as a false "already written".
  useEffect(() => {
    lastSyncedRef.current = null;
  }, [draftKey]);

  return { seed, discard, isDirtyAgainst, baseline };
}
