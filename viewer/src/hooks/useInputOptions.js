import useStore from '../stores/store';

/**
 * Hook to get input options from the store.
 *
 * Options are pre-loaded by useInputsData at the Dashboard level.
 * This hook simply reads from the Zustand store, avoiding per-component
 * API calls and eliminating cascading re-renders.
 *
 * @param {object} input - The dereferenced input object from dashboard item
 * @param {string} projectId - Project ID (unused, kept for API compatibility)
 * @returns {array} - Options array or empty array if not loaded
 */
export const useInputOptions = (input, projectId) => {
  // Use specific selector to only get THIS input's options
  const thisInputOptions = useStore(state => state.inputOptions[input?.name]);

  // Return options from store or fallback to static options from input object
  return thisInputOptions || input?.options || [];
};

/**
 * Hook to get full input data from the store.
 *
 * Input data is pre-loaded by useInputsData at the Dashboard level.
 * This hook simply reads from the Zustand store.
 *
 * @param {object} input - The dereferenced input object from dashboard item
 * @param {string} projectId - Project ID (unused, kept for API compatibility)
 * @returns {object|null} - Full input data or null if not loaded
 */
export const useInputData = (input, projectId) => {
  // Use specific selector to only get THIS input's data
  const thisInputData = useStore(state => state.inputData?.[input?.name]);
  return thisInputData || null;
};
