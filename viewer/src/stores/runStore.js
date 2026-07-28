import * as branchingApi from '../api/branching';

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
const createRunSlice = (set, get) => ({
  latestRun: null, // {id, state, created_at, dag_filter, error_json} | null
  // The FULL recent-runs list (cloud Run shape) — feeds the per-record
  // failure selectors in runFailures.js (VIS-993 §2), which match failed runs
  // to record names via dag_filter. Stays [] where the endpoint 404s.
  runs: [],
  lastSucceededRunId: null,
  runDataVersion: 0,

  pollRuns: async () => {
    const projectId = get().project?.id;
    if (!projectId) return null;
    let runs;
    try {
      runs = await branchingApi.fetchRuns(projectId);
    } catch (e) {
      return null; // no run endpoint here (local serve / dist) — nothing to poll
    }
    const latest = (runs && runs[0]) || null;
    set({ latestRun: latest, runs: runs || [] });

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
        // The run just built (some of) the staged set, so that list and the
        // Runs-tab dot are now stale. This is the one transition /changes/
        // doesn't already cover: it refreshes on every save, but a run
        // completing isn't a save. One request per successful run, not per poll.
        get().checkCommitStatus?.();
      }
    }
    return latest;
  },

  /**
   * Launch a run for the current project.
   *
   * With no argument it builds the staged set — the server derives the scope
   * from the same data the Run view listed, so the two can't disagree. Pass
   * `{ dagFilter: '' }` for a deliberate full rebuild ("Run all").
   *
   * A 409 means one is already in flight; that's a state to show, not an error.
   */
  triggerRun: async ({ dagFilter } = {}) => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    const { status, body } = await branchingApi.triggerRun(projectId, { dagFilter });
    if (status === 201) {
      // Adopt it immediately so the tab spinner starts on click rather than on
      // the next poll tick.
      set({ latestRun: body, runs: [body, ...get().runs] });
      return { success: true, run: body };
    }
    await get().pollRuns();
    return { success: false, action: body?.action, error: body?.detail };
  },
});

export default createRunSlice;
