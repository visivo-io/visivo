const createInsightSlice = (set) => ({
  insights: {},

  // add multiple insights
  setInsights: (newInsights) =>
    set(() => ({
      insights: { ...newInsights },
    })),

  // update a single insight by name
  updateInsight: (insightName, dataObj) =>
    set((state) => ({
      insights: {
        ...state.insights,
        [insightName]: dataObj,
      },
    })),
});

export default createInsightSlice;
