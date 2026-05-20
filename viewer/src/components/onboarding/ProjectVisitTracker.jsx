import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { hasCompletedOnboarding, readOnboardingState, writeOnboardingState } from './onboardingState';

/**
 * Records the first time a user navigates to /project after completing
 * onboarding. The onboarding checklist's `view_project` row keys off
 * `persisted.visited_project_route` so this is the signal that ticks
 * that item over from a click-only stub to a real outcome predicate.
 *
 * Mounts inside ProjectContainer (or the dist-mode equivalent) so it
 * fires once per project route entry and never on /editor or /explorer.
 */
export default function ProjectVisitTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!hasCompletedOnboarding()) return;
    if (!location.pathname.startsWith('/project')) return;
    const persisted = readOnboardingState() || {};
    if (persisted.visited_project_route) return;
    writeOnboardingState({
      ...persisted,
      visited_project_route: new Date().toISOString(),
    });
  }, [location.pathname]);

  return null;
}
