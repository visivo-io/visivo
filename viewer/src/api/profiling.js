import { getUrl } from '../contexts/URLContext';

/**
 * Fetch profile statistics for a model's columns.
 * @param {string} modelName - Name of the model to profile
 * @param {number} tier - Profiling tier (1=basic, 2=full). Default 2.
 * @returns {Promise<{columns: Array, row_count: number}>}
 */
export const fetchModelProfile = async (modelName, tier = 2) => {
  const baseUrl = getUrl('modelProfile', { name: modelName });
  const url = `${baseUrl}?tier=${tier}`;
  const response = await fetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error(`Failed to fetch profile for model: ${modelName}`);
};

/**
 * Fetch histogram / top-values data for a single column.
 * @param {string} modelName - Name of the model
 * @param {string} column - Column name
 * @param {number} bins - Number of histogram bins. Default 20.
 * @returns {Promise<{buckets: Array, total_count: number, column_type: string}>}
 */
export const fetchModelHistogram = async (modelName, column, bins = 20) => {
  const baseUrl = getUrl('modelHistogram', { name: modelName, column });
  const url = `${baseUrl}?bins=${bins}`;
  const response = await fetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error(`Failed to fetch histogram for column: ${column}`);
};
