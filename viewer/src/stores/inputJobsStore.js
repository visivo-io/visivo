/**
 * Check if a value looks like an ISO date string (YYYY-MM-DD format).
 * @param {*} v - Value to check
 * @returns {boolean} - True if value matches ISO date format
 */
const isIsoDateString = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

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
 * Escape a string value for SQL by quoting and escaping internal single quotes.
 * @param {*} v - Value to escape
 * @returns {string} - SQL-safe quoted string (e.g., "'O''Reilly'")
 */
const escapeForSql = v => {
  if (v === null || v === undefined) return 'NULL';
  const str = String(v);
  return `'${str.replace(/'/g, "''")}'`;
};

/**
 * Compute accessor values for a multi-select input.
 * Multi-select inputs have .values, .min, .max, .first, .last accessors.
 *
 * .values returns a pre-quoted SQL list for use in IN clauses.
 * e.g., ["Category A", "O'Reilly"] => "'Category A','O''Reilly'"
 * .min/.max work for both numeric values and ISO date strings (YYYY-MM-DD).
 * .first/.last return raw values.
 *
 * @param {Array} selectedValues - Array of selected values
 * @returns {Object} - Accessor object { values, min, max, first, last }
 */
const computeMultiSelectAccessors = selectedValues => {
  if (!selectedValues || selectedValues.length === 0) {
    return { values: null, min: null, max: null, first: null, last: null };
  }

  // Build pre-quoted SQL list for .values accessor
  const values = selectedValues.map(v => escapeForSql(v)).join(',');

  // Compute min/max - works for both numbers and ISO date strings
  let min = null;
  let max = null;

  // Check if all values are numeric
  const numericValues = selectedValues.filter(v => typeof v === 'number' || !isNaN(Number(v)));

  if (numericValues.length === selectedValues.length && numericValues.length > 0) {
    // All values are numeric - use Math.min/max
    const parsed = numericValues.map(v => (typeof v === 'number' ? v : Number(v)));
    min = Math.min(...parsed);
    max = Math.max(...parsed);
  } else {
    // Check if all values are ISO date strings
    const dateValues = selectedValues.filter(isIsoDateString);

    if (dateValues.length === selectedValues.length && dateValues.length > 0) {
      // All values are date strings - sort lexicographically (works for ISO dates)
      const sorted = [...dateValues].sort();
      min = sorted[0];
      max = sorted[sorted.length - 1];
    }
  }

  return {
    values, // Pre-quoted SQL list: "'val1','val2'"
    min,
    max,
    first: selectedValues[0],
    last: selectedValues[selectedValues.length - 1],
  };
};

/**
 * Input Jobs Store Slice
 *
 * Manages input runtime state: accessor values, selected values, options, and data.
 */
const createInputJobsSlice = set => ({
  inputJobs: {}, // Store for input accessor objects: { inputName: { value: 'quoted' } or { values, min, max, first, last } }
  inputSelectedValues: {}, // Raw selected values for UI display: { inputName: value | [values] }
  inputJobOptions: {}, // Store for pre-computed input options: { inputName: ['option1', 'option2'] }
  inputJobData: {}, // Store for full input data from JSON: { inputName: { type, structure, results, ... } }
  inputJobsInitialized: {}, // Track which inputs have been initialized: { inputName: true }

  // Set options for a specific input
  setInputJobOptions: (inputName, options) =>
    set(state => ({
      inputJobOptions: {
        ...state.inputJobOptions,
        [inputName]: options,
      },
    })),

  // Set full input data for a specific input
  setInputJobData: (inputName, data) =>
    set(state => ({
      inputJobData: {
        ...state.inputJobData,
        [inputName]: data,
      },
    })),

  /**
   * Set input value with accessor structure on a user selection change.
   * Automatically computes the appropriate accessor values based on input type
   * and marks the input as initialized.
   *
   * This writes only to the store — it does NOT itself re-run any insight query.
   * Input-driven refetch is owned entirely by `useInsightsData`: writing the new
   * accessor object into `inputJobs` here re-keys that hook's react-query query
   * (its queryKey folds in the relevant input values), which re-runs the insight
   * exactly once and settles. Keeping a single refetch path — rather than a
   * second imperative DuckDB re-query here — is what avoids the VIS-831 class of
   * input→insight feedback loops.
   *
   * @param {string} inputName - Name of the input
   * @param {string|number|Array} rawValue - Raw selected value(s)
   * @param {string} inputType - 'single-select' or 'multi-select' (default: 'single-select')
   */
  setInputJobValue: (inputName, rawValue, inputType = 'single-select') =>
    set(state => {
      const accessors =
        inputType === 'multi-select'
          ? computeMultiSelectAccessors(Array.isArray(rawValue) ? rawValue : [rawValue])
          : computeSingleSelectAccessors(rawValue);

      return {
        inputJobs: { ...state.inputJobs, [inputName]: accessors },
        inputSelectedValues: { ...state.inputSelectedValues, [inputName]: rawValue },
        inputJobsInitialized: { ...state.inputJobsInitialized, [inputName]: true },
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
  setDefaultInputJobValue: (inputName, rawValue, inputType = 'single-select') =>
    set(state => {
      const accessors =
        inputType === 'multi-select'
          ? computeMultiSelectAccessors(Array.isArray(rawValue) ? rawValue : [rawValue])
          : computeSingleSelectAccessors(rawValue);

      return {
        inputJobs: { ...state.inputJobs, [inputName]: accessors },
        inputSelectedValues: { ...state.inputSelectedValues, [inputName]: rawValue },
        inputJobsInitialized: { ...state.inputJobsInitialized, [inputName]: true },
      };
    }),

  /**
   * Batch set multiple default input values at once.
   * Reduces multiple set() calls to a single update.
   *
   * @param {Array<{name: string, value: any, type: string}>} inputDefaults - Array of input defaults
   */
  setDefaultInputJobValues: inputDefaults =>
    set(state => {
      if (!inputDefaults || inputDefaults.length === 0) {
        return state;
      }

      const newInputJobs = { ...state.inputJobs };
      const newInputSelectedValues = { ...state.inputSelectedValues };
      const newInputJobsInitialized = { ...state.inputJobsInitialized };

      inputDefaults.forEach(({ name, value, type = 'single-select' }) => {
        const accessors =
          type === 'multi-select'
            ? computeMultiSelectAccessors(Array.isArray(value) ? value : [value])
            : computeSingleSelectAccessors(value);

        newInputJobs[name] = accessors;
        newInputSelectedValues[name] = value;
        newInputJobsInitialized[name] = true;
      });

      return {
        inputJobs: newInputJobs,
        inputSelectedValues: newInputSelectedValues,
        inputJobsInitialized: newInputJobsInitialized,
      };
    }),
});

export default createInputJobsSlice;
