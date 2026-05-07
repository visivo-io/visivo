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
