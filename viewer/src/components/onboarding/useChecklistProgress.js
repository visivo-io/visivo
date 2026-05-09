import { useEffect, useMemo, useState } from 'react';

import useStore from '../../stores/store';
import { buildChecklistForRole } from './onboardingManifest';
import { readOnboardingState, writeOnboardingState } from './onboardingState';
import { fireEvent } from './telemetry';

/**
 * Compute the live checklist for the user's current role.
 *
 * - Subscribes to the project slice via useStore so any backend change
 *   (newly created source / dashboard / model / etc) re-runs predicates.
 * - Maintains a sticky-completion set in localStorage: once an item is
 *   satisfied it stays done across reloads. This matches the legacy
 *   inline behavior in OnboardingChecklist.
 * - Emits onboarding_checklist_item_satisfied exactly once per item.
 *
 * Returns { items, completed, total, currentItem }:
 *   - items.done flips true when the item's predicate fires OR when the
 *     id is in the sticky set.
 *   - currentItem is the lowest-weight not-yet-done item — the natural
 *     anchor for OnboardingCoach (Phase 4).
 */
export default function useChecklistProgress(roleId) {
  const project = useStore(s => s.project);

  const [stickySatisfied, setStickySatisfied] = useState(
    () => new Set((readOnboardingState() || {}).checklist_checked || [])
  );

  const items = useMemo(() => {
    const persisted = readOnboardingState() || {};
    return buildChecklistForRole(roleId).map(it => {
      const predicateDone = !!it.predicate({ project, persisted });
      return {
        ...it,
        done: predicateDone || stickySatisfied.has(it.id),
      };
    });
  }, [project, roleId, stickySatisfied]);

  // Persist newly-satisfied items + emit telemetry once per item.
  useEffect(() => {
    const persisted = readOnboardingState() || {};
    const persistedChecked = new Set(persisted.checklist_checked || []);
    let changed = false;
    items.forEach(it => {
      if (it.done && !persistedChecked.has(it.id)) {
        fireEvent('onboarding_checklist_item_satisfied', {
          item_id: it.id,
          satisfied_via: stickySatisfied.has(it.id) ? 'click_through' : 'background_signal',
        });
        persistedChecked.add(it.id);
        changed = true;
      }
    });
    if (changed) {
      writeOnboardingState({
        ...persisted,
        checklist_checked: Array.from(persistedChecked),
      });
      setStickySatisfied(new Set(persistedChecked));
    }
  }, [items, stickySatisfied]);

  const completed = items.filter(i => i.done).length;
  const total = items.length;
  const currentItem = items.find(i => !i.done) || null;

  return { items, completed, total, currentItem };
}
