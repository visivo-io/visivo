import { useEffect } from 'react';
import useStore from '../stores/store';
import { ACTIVE_RUN_STATES } from '../stores/runStore';

/**
 * Poll the active project's run status while editing a draft, so rendered data
 * refreshes when a run finishes (runStore bumps runDataVersion → data hooks
 * refetch) and the toolbar run indicator always reflects the current run.
 *
 * Polls continuously while the project is a draft (project.status === 'draft'),
 * faster while a run is in flight (2s) and slower when idle (4s). It has to run
 * even when the user isn't actively saving — a run can start from a coalesced
 * save, sit queued through a cold start, or simply be watched from the Runs
 * view — and a self-stopping poller would miss those and leave the indicator
 * stale while the Runs rows (which poll independently) show it running. Polling
 * stops on its own once the draft is committed/deployed (status leaves 'draft').
 * Local serve reports status 'draft'; dist has no status, so the poller stays
 * off there — correct, a build without a run model has no runs to poll.
 */
export const useRunPolling = () => {
  const projectId = useStore(state => state.project?.id);
  const isDraft = useStore(state => state.project?.status === 'draft');
  const pollRuns = useStore(state => state.pollRuns);

  useEffect(() => {
    if (!projectId || !isDraft) return undefined;
    let timer;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await pollRuns();
      if (cancelled) return;
      const active = ACTIVE_RUN_STATES.includes(useStore.getState().latestRun?.state);
      timer = setTimeout(tick, active ? 2000 : 4000);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, isDraft, pollRuns]);
};

export default useRunPolling;
