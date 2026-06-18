import { useEffect } from 'react';
import useStore from '../stores/store';
import { ACTIVE_RUN_STATES } from '../stores/runStore';

/**
 * Poll the active project's run status while editing a draft, so rendered data
 * refreshes when a run finishes (runStore bumps runDataVersion → data hooks
 * refetch) and the UI can show a live run indicator.
 *
 * Only polls a draft (project.deploy_finished_at === null). Published projects
 * and local `visivo serve` (no deploy_finished_at on the blob) don't poll —
 * keeping it endpoint-driven with no local-vs-cloud branching.
 *
 * Cadence: faster while a run is in flight or there are uncommitted changes (a
 * debounced run may be incoming), slower otherwise.
 */
export const useRunPolling = () => {
  const projectId = useStore(state => state.project?.id);
  const isDraft = useStore(state => state.project?.deploy_finished_at === null);
  const latestRunState = useStore(state => state.latestRun?.state);
  const hasUncommittedChanges = useStore(state => state.hasUncommittedChanges);
  const pollRuns = useStore(state => state.pollRuns);

  const busy = ACTIVE_RUN_STATES.includes(latestRunState) || hasUncommittedChanges;

  useEffect(() => {
    if (!projectId || !isDraft) return undefined;
    pollRuns();
    const interval = setInterval(pollRuns, busy ? 2500 : 8000);
    return () => clearInterval(interval);
  }, [projectId, isDraft, busy, pollRuns]);
};

export default useRunPolling;
