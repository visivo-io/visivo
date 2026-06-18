import * as cloudEditingApi from '../api/cloudEditing';

export const ACTIVE_RUN_STATES = ['queued', 'running'];

/**
 * Run-status slice (cloud/draft editing).
 *
 * Polls the draft's runs so the editor can: (a) show a live run indicator, and
 * (b) refresh rendered data the moment a run succeeds — without a manual reload.
 * `runDataVersion` bumps when a NEW run reaches `succeeded`; data hooks pass it
 * as their `cacheKey`, so the bump forces a refetch of the freshly-built output.
 *
 * Endpoint-driven: `fetchRuns` 404s where there is no run model (local serve /
 * dist), so `pollRuns` simply no-ops there.
 */
// How long after an edit to keep watching for the debounced run to start /
// finish. Once a run is in flight the poller stays on regardless; this only
// bridges the save -> run-start gap so we don't poll forever on a dirty draft.
const POLL_WINDOW_MS = 20000;

const createRunSlice = (set, get) => ({
  latestRun: null, // {id, state, created_at, dag_filter, error_json} | null
  lastSucceededRunId: null,
  runDataVersion: 0,
  pollWindowUntil: 0, // poll while now < this (set on each edit)

  // Called after an edit (a save) — a debounced run is incoming, so open the
  // polling window. The poller stops on its own once the window passes and no
  // run is in flight.
  noteDraftActivity: () => set({ pollWindowUntil: Date.now() + POLL_WINDOW_MS }),

  pollRuns: async () => {
    const projectId = get().project?.id;
    if (!projectId) return null;
    let runs;
    try {
      runs = await cloudEditingApi.fetchRuns(projectId);
    } catch (e) {
      return null; // no run endpoint here (local serve / dist) — nothing to poll
    }
    const latest = (runs && runs[0]) || null;
    set({ latestRun: latest });

    const succeeded = (runs || []).find(r => r.state === 'succeeded');
    if (succeeded) {
      const prev = get().lastSucceededRunId;
      if (prev === null) {
        // First poll: adopt the current succeeded run as the baseline. The data
        // already on screen reflects it, so don't trigger a spurious refetch.
        set({ lastSucceededRunId: succeeded.id });
      } else if (succeeded.id !== prev) {
        // A newer run finished — bump so data hooks refetch the rebuilt output.
        set({ lastSucceededRunId: succeeded.id, runDataVersion: get().runDataVersion + 1 });
      }
    }
    return latest;
  },
});

export default createRunSlice;
