/**
 * Insight Jobs Store Slice
 *
 * Manages insight job runtime data for visualization.
 */
const createInsightJobsSlice = set => ({
  insightJobs: {},

  setInsightJobs: newInsightJobs => {
    set(state => {
      const merged = { ...state.insightJobs, ...newInsightJobs };
      return { insightJobs: merged };
    });
  },

  updateInsightJob: (insightName, dataObj) =>
    set(state => ({
      insightJobs: {
        ...state.insightJobs,
        [insightName]: {
          ...(state.insightJobs[insightName] || {}),
          ...dataObj,
        },
      },
    })),

  /**
   * Explore 2.0 Phase 4 (S2 draft-rendering-decision.md's "gap to close, not
   * a blocker"): explicit cleanup for a synthetic draft-namespaced
   * `insightJobs` entry (e.g. `__draft__:<insightName>`) — called on
   * exploration-tab close/unmount and on insight rename, so a long session
   * never leaks stale draft-preview keys. A no-op for an unknown key.
   */
  removeInsightJob: insightName =>
    set(state => {
      if (!(insightName in state.insightJobs)) return {};
      const next = { ...state.insightJobs };
      delete next[insightName];
      return { insightJobs: next };
    }),
});

export default createInsightJobsSlice;
