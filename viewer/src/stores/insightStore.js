import { prepPostQuery, runDuckDBQuery } from '../duckdb/queries';
import { ContextString } from '../utils/contextString';

/**
 * Compute accessor values for a single-select input.
 * Single-select inputs have only a `.value` accessor.
 *
 * @param {string|number} selectedValue - The selected value
 * @returns {Object} - Accessor object { value: string }
 */
const computeSingleSelectAccessors = selectedValue => {
  if (selectedValue === null || selectedValue === undefined) {
    return { value: null };
  }
  // Quote strings for SQL, leave numbers as-is
  const value = typeof selectedValue === 'string' ? `'${selectedValue}'` : selectedValue;
  return { value };
};

/**
 * Compute accessor values for a multi-select input.
 * Multi-select inputs have .values, .min, .max, .first, .last accessors.
 *
 * @param {Array} selectedValues - Array of selected values
 * @returns {Object} - Accessor object { values, min, max, first, last }
 */
const computeMultiSelectAccessors = selectedValues => {
  if (!selectedValues || selectedValues.length === 0) {
    return { values: null, min: null, max: null, first: null, last: null };
  }

  // Quote strings for SQL IN clause, leave numbers as-is
  const quotedValues = selectedValues.map(v => (typeof v === 'string' ? `'${v}'` : v));
  const values = quotedValues.join(',');

  // Extract numeric values for min/max
  const numericValues = selectedValues.filter(v => typeof v === 'number' || !isNaN(Number(v)));
  const parsedNumerics = numericValues.map(v => (typeof v === 'number' ? v : Number(v)));

  return {
    values,
    min: parsedNumerics.length > 0 ? Math.min(...parsedNumerics) : null,
    max: parsedNumerics.length > 0 ? Math.max(...parsedNumerics) : null,
    first: selectedValues[0],
    last: selectedValues[selectedValues.length - 1],
  };
};

const createInsightSlice = (set, get) => ({
  insights: {},
  inputs: {}, // Store for input accessor objects: { inputName: { value: 'quoted' } or { values, min, max, first, last } }
  inputOptions: {}, // Store for pre-computed input options: { inputName: ['option1', 'option2'] }
  inputData: {}, // Store for full input data from JSON: { inputName: { type, structure, results, ... } }
  db: null,

  setDB: db => set({ db }),

  // Set options for a specific input
  setInputOptions: (inputName, options) =>
    set(state => ({
      inputOptions: {
        ...state.inputOptions,
        [inputName]: options,
      },
    })),

  // Set full input data for a specific input
  setInputData: (inputName, data) =>
    set(state => ({
      inputData: {
        ...state.inputData,
        [inputName]: data,
      },
    })),

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

  /**
   * Set input value with accessor structure.
   * Automatically computes the appropriate accessor values based on input type.
   *
   * @param {string} inputName - Name of the input
   * @param {string|number|Array} rawValue - Raw selected value(s)
   * @param {string} inputType - 'single-select' or 'multi-select' (default: 'single-select')
   */
  setInputValue: (inputName, rawValue, inputType = 'single-select') =>
    set(state => {
      // Compute accessor values based on input type
      const accessors =
        inputType === 'multi-select'
          ? computeMultiSelectAccessors(Array.isArray(rawValue) ? rawValue : [rawValue])
          : computeSingleSelectAccessors(rawValue);

      const newInputs = { ...state.inputs, [inputName]: accessors };

      setTimeout(async () => {
        const { insights, db } = get();

        // Find insights that depend on this input
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
          let post_query = prepPostQuery(insight, newInputs);
          try {
            const result = await runDuckDBQuery(db, post_query, 3, 300);
            const processedRows =
              result.toArray().map(row => {
                const rowData = row.toJSON();
                return Object.fromEntries(
                  Object.entries(rowData).map(([key, value]) => [
                    key,
                    typeof value === 'bigint' ? value.toString() : value,
                  ])
                );
              }) || [];

            set(s => ({
              insights: {
                ...s.insights,
                [insightName]: {
                  ...s.insights[insightName],
                  insight: processedRows,
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

  /**
   * Set default input value (same as setInputValue but without triggering query refresh)
   */
  setDefaultInputValue: (inputName, rawValue, inputType = 'single-select') =>
    set(state => {
      const accessors =
        inputType === 'multi-select'
          ? computeMultiSelectAccessors(Array.isArray(rawValue) ? rawValue : [rawValue])
          : computeSingleSelectAccessors(rawValue);

      return { inputs: { ...state.inputs, [inputName]: accessors } };
    }),
});

export default createInsightSlice;
