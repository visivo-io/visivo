/* Browser persistence for the onboarding flow. The CLI brief asks for a
   ~/.visivo/onboarding_state.json file, but the local viewer is a React
   app with no filesystem access — so we mirror that contract in
   localStorage under a stable key. The CLI/server can later sync from
   localStorage if needed. */

const KEY = 'visivo.onboarding.v1';

export function readOnboardingState() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeOnboardingState(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    // Same-tab localStorage updates don't fire `storage` events, so
    // notify any subscribed React hooks via a custom event. The Coach
    // + checklist progress hook listen for this so a new action flag
    // (e.g. model_tab_created) immediately re-evaluates step state.
    window.dispatchEvent(new CustomEvent('visivo:onboarding-state-changed'));
  } catch {
    /* localStorage unavailable / quota — onboarding is a one-shot UX, fine to drop */
  }
}

export function clearOnboardingState() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasCompletedOnboarding() {
  const s = readOnboardingState();
  return !!(s && s.completed_at);
}

/* Record a user-initiated onboarding action (model saved, insight saved,
 * dashboard saved, deploy succeeded, etc) into the persisted state.
 *
 * Predicates in onboardingManifest.js read `persisted.actions[id]` so
 * the checklist credits actual user work — not the mere presence of an
 * object that came from a bundled sample. Idempotent: writes the first
 * timestamp and leaves later calls as a no-op.
 *
 * No-op if the user has not completed onboarding yet (the rows are
 * hidden), so we don't pollute fresh-install state.
 */
export function recordOnboardingAction(actionId) {
  if (typeof window === 'undefined') return;
  if (!hasCompletedOnboarding()) return;
  const s = readOnboardingState() || {};
  const actions = s.actions || {};
  if (actions[actionId]) return;
  writeOnboardingState({
    ...s,
    actions: { ...actions, [actionId]: new Date().toISOString() },
  });
}
