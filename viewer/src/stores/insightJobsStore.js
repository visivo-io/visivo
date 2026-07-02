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
});

export default createInsightJobsSlice;
