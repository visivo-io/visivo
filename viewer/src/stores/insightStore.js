import { prepPostQuery, runDuckDBQuery } from '../duckdb/queries';

/**
 * Compute accessor values for a single-select input.
 * Single-select inputs have only a `.value` accessor.
 *
 * Values are returned as-is without any quoting.
 * Users must handle SQL quoting in their queries if needed.
 *
 * @param {string|number} selectedValue - The selected value
 * @returns {Object} - Accessor object { value: string }
 */
const computeSingleSelectAccessors = selectedValue => {
  if (selectedValue === null || selectedValue === undefined) {
    return { value: null };
  }
  return { value: selectedValue };
};

/**
 * Compute accessor values for a multi-select input.
 * Multi-select inputs have .values, .min, .max, .first, .last accessors.
 *
 * Values are returned as-is without any quoting.
 * Users must handle SQL quoting in their queries if needed.
 *
 * @param {Array} selectedValues - Array of selected values
 * @returns {Object} - Accessor object { values, min, max, first, last }
 */
const computeMultiSelectAccessors = selectedValues => {
  if (!selectedValues || selectedValues.length === 0) {
    return { values: null, min: null, max: null, first: null, last: null };
  }

  // Join values as-is, no quoting
  const values = selectedValues.join(',');

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
  inputsInitialized: {}, // Track which inputs have been initialized: { inputName: true }
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
   * Only triggers query refresh if the input was already initialized (user selection change).
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

      // Only trigger query refresh if the input was already initialized
      // This prevents premature query execution during initial load
      const wasAlreadyInitialized = state.inputsInitialized[inputName];

      if (wasAlreadyInitialized) {
        setTimeout(async () => {
          const { insights, db } = get();

          // Guard against db not being initialized yet
          if (!db) {
            console.debug(`Skipping insight refresh: DuckDB not initialized`);
            return;
          }

          // Get fresh inputs after state update
          const currentInputs = get().inputs;

          // Find insights that depend on this input by checking their query
          // Note: insights have .query property (set by useInsightsData)
          const dependentInsights = Object.entries(insights)
            .filter(([_, insight]) => {
              const query = insight?.query || '';
              // Check if query references this input with accessor syntax
              return query.includes(`\${${inputName}.`);
            })
            .map(([name]) => name);

          console.debug(
            `Input '${inputName}' changed. Refreshing ${dependentInsights.length} dependent insights:`,
            dependentInsights
          );

          for (const insightName of dependentInsights) {
            const insight = insights[insightName];
            try {
              // prepPostQuery expects { query: ... }
              const preparedQuery = prepPostQuery({ query: insight.query }, currentInputs);
              console.debug(`Executing query for insight '${insightName}':`, preparedQuery);

              const result = await runDuckDBQuery(db, preparedQuery, 3, 300);
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

              console.debug(`Query for insight '${insightName}' returned ${processedRows.length} rows`);

              // Update with .data field (not .insight) to match useInsightsData structure
              set(s => ({
                insights: {
                  ...s.insights,
                  [insightName]: {
                    ...s.insights[insightName],
                    data: processedRows,
                  },
                },
              }));
            } catch (err) {
              console.error(`Query for ${insightName} failed:`, err);
            }
          }
        }, 0);
      }

      // Mark as initialized (for future calls to trigger refresh)
      return {
        inputs: newInputs,
        inputsInitialized: { ...state.inputsInitialized, [inputName]: true },
      };
    }),

  /**
   * Set default input value and mark as initialized.
   * Does NOT trigger query refresh - used for initial default values.
   *
   * @param {string} inputName - Name of the input
   * @param {string|number|Array} rawValue - Raw default value(s)
   * @param {string} inputType - 'single-select' or 'multi-select' (default: 'single-select')
   */
  setDefaultInputValue: (inputName, rawValue, inputType = 'single-select') =>
    set(state => {
      const accessors =
        inputType === 'multi-select'
          ? computeMultiSelectAccessors(Array.isArray(rawValue) ? rawValue : [rawValue])
          : computeSingleSelectAccessors(rawValue);

      return {
        inputs: { ...state.inputs, [inputName]: accessors },
        inputsInitialized: { ...state.inputsInitialized, [inputName]: true },
      };
    }),
});

export default createInsightSlice;
