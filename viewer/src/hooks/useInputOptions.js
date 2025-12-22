import { useEffect } from 'react';
import useStore from '../stores/store';
import { useFetchInputOptions } from '../contexts/QueryContext';
import { loadInputData } from '../api/inputs';
import {
  isDateExpression,
  isStepUnit,
  resolveDateRangeToOptions,
} from '../utils/dateExpressions';

/**
 * Hook to load input options from JSON files on-demand.
 *
 * This hook is the SINGLE SOURCE for setting default input values.
 * It loads data when the component mounts, caches results in the store,
 * and sets defaults via setDefaultInputValue (which marks inputs as initialized).
 *
 * @param {object} input - The dereferenced input object from dashboard item
 * @param {string} projectId - Project ID for URL construction
 * @returns {array} - Options array or empty array if not loaded
 */
export const useInputOptions = (input, projectId) => {
  const fetchInputOptions = useFetchInputOptions();
  // Use specific selector to only get THIS input's options, avoiding re-renders when other inputs load
  const thisInputOptions = useStore(state => state.inputOptions[input?.name]);
  const setInputOptions = useStore(state => state.setInputOptions);
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue);

  useEffect(() => {
    const loadOptions = async () => {
      // Skip if no input or no hash
      if (!input?.name || !input?.name_hash) {
        return;
      }

      // Skip if already loaded - check store directly to avoid stale closure
      const currentOptions = useStore.getState().inputOptions[input.name];
      if (currentOptions) {
        return;
      }

      try {
        // Fetch JSON URL
        const url = await fetchInputOptions(projectId, input.name_hash);

        // Load full input data from JSON
        const data = await loadInputData(url);

        // Extract options based on structure
        let options = [];
        if (data.structure === 'options' && data.results?.options) {
          options = data.results.options.map(String);
        } else if (data.structure === 'range' && data.results?.range) {
          const { start, end, step } = data.results.range;

          // Check if this is a date-based range (date expressions or date-range display type)
          const isDateRange =
            isDateExpression(start) ||
            isDateExpression(end) ||
            isStepUnit(step) ||
            data.results?.display?.type === 'date-range';

          if (isDateRange) {
            // Generate date range options
            options = resolveDateRangeToOptions(start, end, step);
          } else {
            // Numeric range generation
            const numStart = typeof start === 'number' ? start : parseFloat(start);
            const numEnd = typeof end === 'number' ? end : parseFloat(end);
            const numStep = typeof step === 'number' ? step : parseFloat(step);

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
          }
        }

        // Store options in state
        setInputOptions(input.name, options);

        // Extract and set default from JSON (this is the ONLY place defaults are set)
        // Priority: JSON display.default > input object default > first option
        let defaultValue;

        // Handle range-based defaults (start/end)
        if (data.structure === 'range' && data.results?.display?.default) {
          const rangeDefault = data.results.display.default;
          if (rangeDefault.start !== undefined && rangeDefault.end !== undefined) {
            // Resolve date expressions in range defaults
            let startVal = isDateExpression(rangeDefault.start)
              ? resolveDateRangeToOptions(rangeDefault.start, rangeDefault.start, '1 day')[0]
              : rangeDefault.start;
            let endVal = isDateExpression(rangeDefault.end)
              ? resolveDateRangeToOptions(rangeDefault.end, rangeDefault.end, '1 day')[0]
              : rangeDefault.end;

            // Find all options within the default range
            defaultValue = options.filter(opt => {
              const val = opt;
              return val >= String(startVal) && val <= String(endVal);
            });

            // If no options in range, fall back to full range
            if (defaultValue.length === 0) {
              defaultValue = options;
            }
          }
        }

        // Fall back to standard default handling
        if (defaultValue === undefined) {
          defaultValue =
            data.results?.display?.default?.value ||
            data.results?.display?.default?.values || // multi-select list-based
            input.display?.default?.value ||
            input.default ||
            options[0];
        }

        if (defaultValue !== undefined && defaultValue !== null) {
          // Use type from loaded JSON data, fallback to input object
          const inputType = data.type || input.type || 'single-select';
          setDefaultInputValue(input.name, defaultValue, inputType);
        }
      } catch (error) {
        // Failed to load options - component will use fallback
      }
    };

    loadOptions();
    // Note: removed inputOptions from deps to prevent cascade re-runs when other inputs load
    // Instead, we check the store directly inside the effect
  }, [input?.name, input?.name_hash, input?.display?.default?.value, input?.default, input?.type, projectId, setInputOptions, setDefaultInputValue, fetchInputOptions]);

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
  const fetchInputOptions = useFetchInputOptions();
  // Use specific selector to only get THIS input's data, avoiding re-renders when other inputs load
  const thisInputData = useStore(state => state.inputData?.[input?.name]);
  const setInputData = useStore(state => state.setInputData);
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue);

  useEffect(() => {
    const loadData = async () => {
      // Skip if no input or no hash
      if (!input?.name || !input?.name_hash) {
        return;
      }

      // Skip if already loaded - check store directly to avoid stale closure
      const currentData = useStore.getState().inputData?.[input.name];
      if (currentData) {
        return;
      }

      try {
        // Fetch JSON URL
        const url = await fetchInputOptions(projectId, input.name_hash);

        // Load full data from JSON
        const data = await loadInputData(url);

        // Store in state
        if (setInputData) {
          setInputData(input.name, data);
        }

        // Set default value from display config
        const defaultValue =
          data.results?.display?.default?.value ||
          data.results?.display?.default?.values ||
          data.results?.options?.[0];

        if (defaultValue !== undefined && defaultValue !== null) {
          // Use the type from the loaded JSON data
          const inputType = data.type || 'single-select';
          setDefaultInputValue(input.name, defaultValue, inputType);
        }
      } catch (error) {
        // Failed to load data - component will use fallback
      }
    };

    loadData();
    // Note: removed inputData from deps to prevent cascade re-runs when other inputs load
    // Instead, we check the store directly inside the effect
  }, [input?.name, input?.name_hash, projectId, setInputData, setDefaultInputValue, fetchInputOptions]);

  return thisInputData || null;
};
