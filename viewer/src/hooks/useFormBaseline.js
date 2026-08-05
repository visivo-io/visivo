import { useCallback, useState } from 'react';
import isEqual from 'lodash/isEqual';

/**
 * Track a form's last-saved values so it can report dirtiness and revert.
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
 * @param {(values: object) => void} apply - push a value set into form state.
 *   Setters are stable, so this can safely be a `useCallback(..., [])`.
 */
export default function useFormBaseline(apply) {
  const [baseline, setBaseline] = useState(null);

  /** Seed form state AND record it as the clean baseline. */
  const seed = useCallback(
    values => {
      setBaseline(values);
      apply(values);
    },
    [apply]
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
    values => baseline !== null && !isEqual(values, baseline),
    [baseline]
  );

  return { seed, discard, isDirtyAgainst, baseline };
}
