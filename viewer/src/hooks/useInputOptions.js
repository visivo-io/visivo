import { useEffect } from 'react';
import useStore from '../stores/store';
import { useFetchInputOptions } from '../contexts/QueryContext';
import { loadInputOptions, loadInputData } from '../api/inputs';

/**
 * Hook to load input options from JSON files on-demand.
 *
 * This hook loads data when the component mounts and caches results in the store
 * to prevent re-fetching.
 *
 * @param {object} input - The dereferenced input object from dashboard item
 * @param {string} projectId - Project ID for URL construction
 * @returns {array|null} - Options array or null if not loaded
 */
export const useInputOptions = (input, projectId) => {
  const fetchInputOptions = useFetchInputOptions(); // Use context for environment-specific fetch
  const inputOptions = useStore(state => state.inputOptions);
  const setInputOptions = useStore(state => state.setInputOptions);
  const setInputValue = useStore(state => state.setInputValue);

  useEffect(() => {
    const loadOptions = async () => {
      // Skip if no input or no hash
      if (!input?.name || !input?.name_hash) {
        return;
      }

      // Skip if already loaded
      if (inputOptions[input.name]) {
        return;
      }

      try {
        // Fetch JSON URL
        const url = await fetchInputOptions(projectId, input.name_hash);

        // Load options from JSON (passing null for deprecated db parameter)
        const options = await loadInputOptions(null, url);

        // Store in state
        setInputOptions(input.name, options);

        // Set default value from display config or first option
        const defaultValue = input.display?.default?.value || input.default || options[0];
        if (defaultValue) {
          // Determine input type from the input object or inputData
          const inputType = input.type || 'single-select';
          setInputValue(input.name, defaultValue, inputType);
        }
      } catch (error) {
        console.error(`useInputOptions: Failed to load options for input '${input.name}':`, error);
      }
    };

    loadOptions();
  }, [input, inputOptions, projectId, setInputOptions, setInputValue, fetchInputOptions]);

  // Return options from store or fallback to serialized (for static inputs)
  return inputOptions[input?.name] || input?.options;
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
  const inputData = useStore(state => state.inputData);
  const setInputData = useStore(state => state.setInputData);
  const setInputValue = useStore(state => state.setInputValue);

  useEffect(() => {
    const loadData = async () => {
      // Skip if no input or no hash
      if (!input?.name || !input?.name_hash) {
        return;
      }

      // Skip if already loaded
      if (inputData?.[input.name]) {
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
        const defaultValue = data.results?.display?.default?.value || data.results?.options?.[0];
        if (defaultValue) {
          // Use the type from the loaded JSON data
          const inputType = data.type || 'single-select';
          setInputValue(input.name, defaultValue, inputType);
        }
      } catch (error) {
        console.error(`useInputData: Failed to load data for input '${input.name}':`, error);
      }
    };

    loadData();
  }, [input, inputData, projectId, setInputData, setInputValue, fetchInputOptions]);

  return inputData?.[input?.name] || null;
};
