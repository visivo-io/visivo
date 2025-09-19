const createInsightSlice = set => ({
  insights: {},
  setInsights: newInsights =>
    set(state => ({
      insights: {
        ...state.insights,
        ...newInsights,
      },
    })),

  updateInsight: (insightName, dataObj) =>
    set(state => ({
      insights: {
        ...state.insights,
        [insightName]: dataObj,
      },
    })),
});

export default createInsightSlice;
