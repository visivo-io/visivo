import { useEffect } from 'react';
import useStore from '../stores/store';
import { useDuckDB } from '../contexts/DuckDBContext';
import { fetchInputOptions, loadInputOptions } from '../api/inputs';

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
  const inputOptions = useStore(state => state.inputOptions);
  const setInputOptions = useStore(state => state.setInputOptions);
  const setInputValue = useStore(state => state.setInputValue);

  console.log('useInputOptions hook called:', {
    inputName: input?.name,
    hasDb: !!db,
    dbValue: db,
    inputOptionsKeys: Object.keys(inputOptions),
  });

  useEffect(() => {
    console.log('useInputOptions useEffect triggered, db =', db);
    const loadOptions = async () => {
      console.log('useInputOptions effect running:', {
        inputName: input?.name,
        inputNameHash: input?.name_hash,
        hasDb: !!db,
        alreadyLoaded: inputOptions[input?.name] ? true : false,
        projectId,
      });

      // Skip if no input or no hash
      if (!input?.name || !input?.name_hash) {
        console.log('useInputOptions: skipping - no input name or hash');
        return;
      }

      // Skip if already loaded
      if (inputOptions[input.name]) {
        console.log('useInputOptions: skipping - already loaded');
        return;
      }

      // Skip if DuckDB not ready
      if (!db) {
        console.log('useInputOptions: skipping - DuckDB not ready');
        return;
      }

      try {
        // Fetch parquet URL
        console.log('useInputOptions: fetching URL for hash:', input.name_hash);
        const url = await fetchInputOptions(projectId, input.name_hash);
        console.log('useInputOptions: got URL:', url);

        // Load options from parquet
        console.log('useInputOptions: loading options from parquet');
        const options = await loadInputOptions(db, url);
        console.log('useInputOptions: loaded options:', options);

        // Store in state
        setInputOptions(input.name, options);

        // Set default value
        const defaultValue = input.default || options[0];
        if (defaultValue) {
          setInputValue(input.name, defaultValue);
        }

        console.log(`useInputOptions: Loaded ${options.length} options for input '${input.name}'`);
      } catch (error) {
        console.error(`useInputOptions: Failed to load options for input '${input.name}':`, error);
      }
    };

    loadOptions();
  }, [input, db, inputOptions, projectId, setInputOptions, setInputValue]);

  // Return options from store or fallback to serialized (for static inputs)
  return inputOptions[input?.name] || input?.options;
};
