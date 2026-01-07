import { useEffect } from 'react';
import useStore from '../stores/store';
import { useFetchInputs, useFetchInputOptions } from '../contexts/QueryContext';
import { loadInputData } from '../api/inputs';
import { loadInsightParquetFiles, runDuckDBQuery } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import {
  isDateExpression,
  isStepUnit,
  resolveDateRangeToOptions,
} from '../utils/dateExpressions';

/**
 * Extract options from DuckDB after loading parquet file
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string} nameHash - Table name (parquet file name_hash)
 * @returns {Promise<string[]>} Array of option values
 */
const extractOptionsFromDuckDB = async (db, nameHash) => {
  const query = `SELECT "option" FROM "${nameHash}"`;
  const result = await runDuckDBQuery(db, query, 3, 1000);
  const rows = result.toArray().map(row => row.toJSON());
  return rows.map(row => String(row.option));
};

/**
 * Generate range options (numeric or date-based)
 * @param {Object} range - Range configuration { start, end, step }
 * @param {string} displayType - Display type (e.g., 'date-range')
 * @returns {string[]} Array of generated options
 */
const generateRangeOptions = (range, displayType) => {
  const { start, end, step } = range;

  // Check if this is a date-based range
  const isDateRange =
    isDateExpression(start) ||
    isDateExpression(end) ||
    isStepUnit(step) ||
    displayType === 'date-range';

  if (isDateRange) {
    return resolveDateRangeToOptions(start, end, step);
  }

  // Numeric range generation
  const numStart = typeof start === 'number' ? start : parseFloat(start);
  const numEnd = typeof end === 'number' ? end : parseFloat(end);
  const numStep = typeof step === 'number' ? step : parseFloat(step);

  const options = [];
  if (!isNaN(numStart) && !isNaN(numEnd) && !isNaN(numStep) && numStep > 0) {
    for (let val = numStart; val <= numEnd; val += numStep) {
      options.push(String(val));
    }
    // Ensure end value is included if not on step boundary
    const lastVal = parseFloat(options[options.length - 1]);
    if (lastVal < numEnd) {
      options.push(String(numEnd));
    }
  }

  return options;
};

/**
 * Extract default value from input data
 * @param {Object} data - Input data object
 * @param {Object} input - Input object from dashboard
 * @param {string[]} options - Generated/loaded options
 * @returns {*} Default value
 */
const extractDefaultValue = (data, input, options) => {
  // Handle range-based defaults (start/end)
  if (data.structure === 'range' && data.display?.default) {
    const rangeDefault = data.display.default;
    if (rangeDefault.start !== undefined && rangeDefault.end !== undefined) {
      // Resolve date expressions in range defaults
      let startVal = isDateExpression(rangeDefault.start)
        ? resolveDateRangeToOptions(rangeDefault.start, rangeDefault.start, '1 day')[0]
        : rangeDefault.start;
      let endVal = isDateExpression(rangeDefault.end)
        ? resolveDateRangeToOptions(rangeDefault.end, rangeDefault.end, '1 day')[0]
        : rangeDefault.end;

      // Find all options within the default range
      const defaultValue = options.filter(opt => {
        return opt >= String(startVal) && opt <= String(endVal);
      });

      // If options in range, return them
      if (defaultValue.length > 0) {
        return defaultValue;
      }
      // Fall back to full range
      return options;
    }
  }

  // New structure: display.default.value or display.default.values
  if (data.display?.default?.value !== undefined) {
    return data.display.default.value;
  }
  if (data.display?.default?.values !== undefined) {
    return data.display.default.values;
  }

  // Legacy structure: results.display.default.value or results.display.default.values
  if (data.results?.display?.default?.value !== undefined) {
    return data.results.display.default.value;
  }
  if (data.results?.display?.default?.values !== undefined) {
    return data.results.display.default.values;
  }

  // Fall back to input object default or first option
  return input.display?.default?.value || input.default || options[0];
};

/**
 * Hook to load input options from JSON files or parquet files on-demand.
 *
 * This hook is the SINGLE SOURCE for setting default input values.
 * It loads data when the component mounts, caches results in the store,
 * and sets defaults via setDefaultInputValue (which marks inputs as initialized).
 *
 * Supports both:
 * - New parquet-based structure (files[], static_props)
 * - Legacy JSON structure (results.options, results.range)
 *
 * @param {object} input - The dereferenced input object from dashboard item
 * @param {string} projectId - Project ID for URL construction
 * @returns {array} - Options array or empty array if not loaded
 */
export const useInputOptions = (input, projectId) => {
  const db = useDuckDB();
  const fetchInputs = useFetchInputs();
  const fetchInputOptions = useFetchInputOptions();
  // Use specific selector to only get THIS input's options, avoiding re-renders when other inputs load
  const thisInputOptions = useStore(state => state.inputOptions[input?.name]);
  const setInputOptions = useStore(state => state.setInputOptions);
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue);

  useEffect(() => {
    const loadOptions = async () => {
      // Skip if no input or no name
      if (!input?.name) {
        return;
      }

      // Skip if already loaded - check store directly to avoid stale closure
      const currentOptions = useStore.getState().inputOptions[input.name];
      if (currentOptions) {
        return;
      }

      try {
        let data;
        let options = [];

        // Try new API first (fetchInputs)
        try {
          const inputs = await fetchInputs(projectId, [input.name]);
          if (inputs && inputs.length > 0) {
            data = inputs[0];
          }
        } catch {
          // New API not available, fall back to legacy
          data = null;
        }

        // Fall back to legacy API if new API didn't return data
        if (!data && input.name_hash) {
          const url = await fetchInputOptions(projectId, input.name_hash);
          data = await loadInputData(url);
        }

        if (!data) {
          return;
        }

        // Check for new parquet-based structure
        if (data.files && Array.isArray(data.files)) {
          // Find options file in files array
          const optionsFile = data.files.find(f => f.key === 'options');

          if (optionsFile && db) {
            // Load parquet file into DuckDB and extract options
            await loadInsightParquetFiles(db, [optionsFile]);
            options = await extractOptionsFromDuckDB(db, optionsFile.name_hash);
          } else if (data.static_props?.options) {
            // Static options from metadata
            options = data.static_props.options.map(String);
          } else if (data.static_props?.range) {
            // Range-based options from metadata
            options = generateRangeOptions(data.static_props.range, data.display?.type);
          }
        } else if (data.results) {
          // Legacy structure: results.options or results.range
          if (data.structure === 'options' && data.results.options) {
            options = data.results.options.map(String);
          } else if (data.structure === 'range' && data.results.range) {
            options = generateRangeOptions(data.results.range, data.results?.display?.type);
          }
        }

        // Store options in state
        setInputOptions(input.name, options);

        // Extract and set default
        const defaultValue = extractDefaultValue(data, input, options);

        if (defaultValue !== undefined && defaultValue !== null) {
          const inputType = data.type || input.type || 'single-select';
          setDefaultInputValue(input.name, defaultValue, inputType);
        }
      } catch (error) {
        // Failed to load options - component will use fallback
        console.debug(`Failed to load options for input '${input.name}':`, error);
      }
    };

    loadOptions();
  }, [
    input?.name,
    input?.name_hash,
    input?.display?.default?.value,
    input?.default,
    input?.type,
    projectId,
    setInputOptions,
    setDefaultInputValue,
    fetchInputs,
    fetchInputOptions,
    db,
  ]);

  // Return options from store or fallback to static options from input object
  return thisInputOptions || input?.options || [];
};

/**
 * Hook to load full input data from JSON files on-demand.
 *
 * Unlike useInputOptions, this returns the full input data structure
 * including type, structure, and display configuration.
 *
 * @param {object} input - The dereferenced input object from dashboard item
 * @param {string} projectId - Project ID for URL construction
 * @returns {object|null} - Full input data or null if not loaded
 */
export const useInputData = (input, projectId) => {
  const fetchInputs = useFetchInputs();
  const fetchInputOptions = useFetchInputOptions();
  // Use specific selector to only get THIS input's data, avoiding re-renders when other inputs load
  const thisInputData = useStore(state => state.inputData?.[input?.name]);
  const setInputData = useStore(state => state.setInputData);
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue);

  useEffect(() => {
    const loadData = async () => {
      // Skip if no input or no name
      if (!input?.name) {
        return;
      }

      // Skip if already loaded - check store directly to avoid stale closure
      const currentData = useStore.getState().inputData?.[input.name];
      if (currentData) {
        return;
      }

      try {
        let data;

        // Try new API first (fetchInputs)
        try {
          const inputs = await fetchInputs(projectId, [input.name]);
          if (inputs && inputs.length > 0) {
            data = inputs[0];
          }
        } catch {
          // New API not available, fall back to legacy
          data = null;
        }

        // Fall back to legacy API if new API didn't return data
        if (!data && input.name_hash) {
          const url = await fetchInputOptions(projectId, input.name_hash);
          data = await loadInputData(url);
        }

        if (!data) {
          return;
        }

        // Store in state
        if (setInputData) {
          setInputData(input.name, data);
        }

        // Set default value from display config
        // New structure
        let defaultValue =
          data.display?.default?.value ||
          data.display?.default?.values ||
          // Legacy structure
          data.results?.display?.default?.value ||
          data.results?.display?.default?.values ||
          // Static options fallback
          data.static_props?.options?.[0] ||
          data.results?.options?.[0];

        if (defaultValue !== undefined && defaultValue !== null) {
          const inputType = data.type || 'single-select';
          setDefaultInputValue(input.name, defaultValue, inputType);
        }
      } catch (error) {
        // Failed to load data - component will use fallback
        console.debug(`Failed to load data for input '${input.name}':`, error);
      }
    };

    loadData();
  }, [
    input?.name,
    input?.name_hash,
    projectId,
    setInputData,
    setDefaultInputValue,
    fetchInputs,
    fetchInputOptions,
  ]);

  return thisInputData || null;
};
