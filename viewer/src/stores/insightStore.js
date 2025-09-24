import { runDuckDBQuery, buildQuery } from "../duckdb/queries";
import { ContextString } from "../utils/context_string";

const createInsightSlice = (set, get) => ({
  insights: {},
  inputs: {},
  db: null,

  setDB: db => set({ db }),

  setInsights: newInsights =>
    set(state => ({
      insights: { ...state.insights, ...newInsights },
    })),

  updateInsight: (insightName, dataObj) =>
    set(state => ({
      insights: {
        ...state.insights,
        [insightName]: {
          ...(state.insights[insightName] || {}),
          ...dataObj,
        },
      },
    })),

  setInputValue: (inputName, value) =>
    set(state => {
      const newInputs = { ...state.inputs, [inputName]: value };

      setTimeout(async () => {
        const { insights, db } = get();

        const dependentInsights = Object.entries(insights)
          .filter(([_, insight]) =>
            insight.interactions?.some(i => {
              if (!ContextString.isContextString(i.filter)) return true;
              const ctx = new ContextString(i.filter);
              return ctx.getReference() === inputName;
            })
          )
          .map(([name]) => name);

        for (const insightName of dependentInsights) {
          const insight = insights[insightName];
          const sql = buildQuery(
            insight.post_query,
            insight.interactions,
            newInputs
          );

          try {
            const result = await runDuckDBQuery(db, sql, 3, 300);

            set(s => ({
              insights: {
                ...s.insights,
                [insightName]: {
                  ...s.insights[insightName],
                  result,
                },
              },
            }));
          } catch (err) {
            console.error(`Query for ${insightName} failed:`, err);
          }
        }
      }, 0);

      return { inputs: newInputs };
    }),
});

export default createInsightSlice;
