import { useEffect } from 'react';
import useStore from '../stores/store';
import { ACTIVE_RUN_STATES } from '../stores/runStore';

/**
 * Poll the active project's run status while editing a draft, so rendered data
 * refreshes when a run finishes (runStore bumps runDataVersion → data hooks
 * refetch) and the UI can show a live run indicator.
 *
 * Only polls a draft (project.deploy_finished_at === null). It self-stops when
 * idle — it runs while a run is in flight OR within the post-edit window
 * (pollWindowUntil, set on each save) — so a dirty draft isn't polled forever.
 * Re-arms whenever a new edit moves pollWindowUntil.
 */
export const useRunPolling = () => {
  const projectId = useStore(state => state.project?.id);
  const isDraft = useStore(state => state.project?.deploy_finished_at === null);
  const pollWindowUntil = useStore(state => state.pollWindowUntil);
  const pollRuns = useStore(state => state.pollRuns);

  useEffect(() => {
    if (!projectId || !isDraft) return undefined;
    let timer;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await pollRuns();
      if (cancelled) return;
      const { latestRun, pollWindowUntil: until } = useStore.getState();
      const active = ACTIVE_RUN_STATES.includes(latestRun?.state);
      const withinWindow = Date.now() < (until || 0);
      // Keep polling only while a run is in flight or we're still watching for
      // one to start; otherwise stop until the next edit re-arms us.
      if (active || withinWindow) {
        timer = setTimeout(tick, active ? 2000 : 4000);
      }
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // pollWindowUntil in deps: a new edit re-arms polling after it has stopped.
  }, [projectId, isDraft, pollWindowUntil, pollRuns]);
};

export default useRunPolling;
