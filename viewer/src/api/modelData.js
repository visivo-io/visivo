import { getUrl, isAvailable } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Fetch pre-computed data for a model (from previous visivo run).
 *
 * @param {string} modelName - The model name
 * @returns {Promise<{available: boolean, columns?: string[], rows?: object[], row_count?: number, truncated?: boolean}>}
 */
export const fetchModelData = async (modelName) => {
  if (!isAvailable('modelData')) {
    return { available: false };
  }

  const response = await apiFetch(getUrl('modelData', { name: modelName }));

  if (response.status === 200) {
    return await response.json();
  }

  return { available: false };
};
