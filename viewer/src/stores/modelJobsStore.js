/**
 * Model Jobs Store Slice
 *
 * Manages model job runtime data for tables that reference models directly.
 */
const createModelJobsSlice = (set) => ({
  modelJobs: {},

  setModelJobs: newModelJobs => {
    set(state => {
      const merged = { ...state.modelJobs, ...newModelJobs };
      return { modelJobs: merged };
    });
  },
});

export default createModelJobsSlice;
