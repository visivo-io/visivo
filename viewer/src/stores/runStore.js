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
// Upper bound on how long after an edit to keep watching for the run. It has to
// cover the runner's cold start (the Cloud Run Job pulls a ~1.7GB image before
// it even starts — ~90s observed) plus the run itself, so a too-short window
// would stop polling before the run is ever visible. Polling stops as soon as
// the run finishes; this is only the give-up bound for a stuck/missing run.
const POLL_WINDOW_MS = 5 * 60 * 1000;

const createRunSlice = (set, get) => ({
  latestRun: null, // {id, state, created_at, dag_filter, error_json} | null
  lastSucceededRunId: null,
  runDataVersion: 0,
  pollWindowUntil: 0, // poll while now < this (set on each edit)
  // Optimistic "a run is coming" flag so the UI shows queued the instant you
  // edit — the real run doesn't exist until the debounce + worker + the runner's
  // cold start (~90s), so without this the indicator sits blank for that whole
  // gap. ``preEditRunId`` is the latest run at edit time, so the poller can tell
  // when THIS edit's (newer) run appears and finishes.
  pendingRun: false,
  preEditRunId: null,

  // Called after an edit (a save) — a debounced run is incoming, so open the
  // polling window and optimistically mark a run pending (queued). The poller
  // clears both once this edit's run finishes / the window passes.
  noteDraftActivity: () =>
    set({
      pollWindowUntil: Date.now() + POLL_WINDOW_MS,
      pendingRun: true,
      preEditRunId: get().latestRun?.id ?? null,
    }),

  // Give up the optimistic "queued" state (the poller calls this if the run
  // never appears/finishes within the window).
  clearPendingRun: () => set({ pendingRun: false }),

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
    set({ latestRun: latest });

    // Clear the optimistic pending flag once THIS edit's run (a new id vs the
    // one present at edit time) has reached a terminal state — succeeded/failed,
    // i.e. no longer active. Until then it stays "queued/running".
    if (
      get().pendingRun &&
      latest &&
      latest.id !== get().preEditRunId &&
      !ACTIVE_RUN_STATES.includes(latest.state)
    ) {
      set({ pendingRun: false });
    }

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
