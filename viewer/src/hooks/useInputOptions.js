import { useEffect } from 'react';
import useStore from '../stores/store';
import { useDuckDB } from '../contexts/DuckDBContext';
import { useFetchInputOptions } from '../contexts/QueryContext';
import { loadInputOptions } from '../api/inputs';

/**
 * Hook to load input options from parquet files on-demand.
 *
 * Similar to useInsightsData, this hook loads data when the component mounts
 * and caches results in the store to prevent re-fetching.
 *
 * @param {object} input - The dereferenced input object from dashboard item
 * @param {string} projectId - Project ID for URL construction
 * @returns {array|null} - Options array or null if not loaded
 */
export const useInputOptions = (input, projectId) => {
  const db = useDuckDB(); // Use context like useInsightsData does
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

      // Skip if DuckDB not ready
      if (!db) {
        return;
      }

      try {
        // Fetch parquet URL
        const url = await fetchInputOptions(projectId, input.name_hash);

        // Load options from parquet
        const options = await loadInputOptions(db, url);

        // Store in state
        setInputOptions(input.name, options);

        // Set default value
        const defaultValue = input.default || options[0];
        if (defaultValue) {
          setInputValue(input.name, defaultValue);
        }
      } catch (error) {
        console.error(`useInputOptions: Failed to load options for input '${input.name}':`, error);
      }
    };

    loadOptions();
  }, [input, db, inputOptions, projectId, setInputOptions, setInputValue, fetchInputOptions]);

  // Return options from store or fallback to serialized (for static inputs)
  return inputOptions[input?.name] || input?.options;
};
