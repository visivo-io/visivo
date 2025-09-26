import { prepPostQuery, runDuckDBQuery } from "../duckdb/queries";
import { ContextString } from "../utils/context_string";

const createInsightSlice = (set, get) => ({
  insights: {},
  inputs: null,
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

  setDefaultInputValue: (inputName, value) =>
    set(state => {
      const newInputs = { ...state.inputs, [inputName]: value };
      return { inputs: newInputs };
     })
  ,
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
          let post_query = prepPostQuery(insight, state.inputs)
          try {
            const result = await runDuckDBQuery(db, post_query, 3, 300);
            const processedRows = result.toArray().map((row) => {
              const rowData = row.toJSON();
              return Object.fromEntries(
                Object.entries(rowData).map(([key, value]) => [
                  key,
                  typeof value === 'bigint' ? value.toString() : value
                ])
              );
            }) || [];

            set(s => ({
              insights: {
                ...s.insights,
                [insightName]: {
                  ...s.insights[insightName],
                  processedRows,
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
