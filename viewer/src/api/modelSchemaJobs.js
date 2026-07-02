import { getUrl, isAvailable } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Fetch the run-phase column schema artifact for a model.
 *
 * The schema is the cheap, cloud-safe sibling of model data: it carries column
 * names + types (and nullability) without the full parquet rows. Unavailable in
 * any environment where the `modelSchema` URL is null (e.g. dist, until the dist
 * build copies model schemas into /data/).
 *
 * @param {string} modelName - The model name
 * @returns {Promise<{available: boolean, columns?: object, model_name?: string, model_type?: string}>}
 */
export const fetchModelSchema = async modelName => {
  if (!isAvailable('modelSchemaJob')) {
    return { available: false };
  }

  const res = await apiFetch(getUrl('modelSchemaJob', { name: modelName }));

  if (res.status === 200) {
    return { available: true, ...(await res.json()) };
  }

  return { available: false };
};

/**
 * Convenience: returns the model's column names as a string[].
 *
 * @param {string} modelName - The model name
 * @returns {Promise<string[]>} Column names, or [] if unavailable / no schema.
 */
export const fetchModelColumnNames = async modelName => {
  const schema = await fetchModelSchema(modelName);
  if (!schema.available || !schema.columns) {
    return [];
  }
  return Object.keys(schema.columns);
};
