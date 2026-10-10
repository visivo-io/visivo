import { getUrl, isAvailable } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Profile a built model or any SQL on a source, server-side (VIS-1413).
 *
 * One classifier for the Explorer and the agent: the response carries the
 * unified column profile (`name, type, null_count, null_percentage, distinct,
 * min, max, avg, median, std_dev, q25, q75, p99, zeros_pct, avg_length,
 * top_values`) and a `shape_cards` list classifying each column.
 *
 * @param {object} params - exactly one of `modelName` or `sourceName` + `sql`.
 * @param {string} [params.modelName]
 * @param {string} [params.sourceName]
 * @param {string} [params.sql]
 * @param {string[]} [params.columns] - at most 40 column names to profile.
 * @param {number} [params.sampleRows] - rows sampled for a query profile.
 * @returns {Promise<{profile: object, shape_cards: object[]}>}
 * @throws {Error} with `.errorType` `'unavailable'`, `'timeout'`, or the server's.
 */
export const fetchProfile = async ({ modelName, sourceName, sql, columns, sampleRows }) => {
  if (!isAvailable('profiles')) {
    const err = new Error('Profiling is not available in this deployment mode');
    err.errorType = 'unavailable';
    throw err;
  }
  const body = modelName ? { model_name: modelName } : { source_name: sourceName, sql };
  if (columns) body.columns = columns;
  if (sampleRows) body.sample_rows = sampleRows;

  const response = await apiFetch(getUrl('profiles'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.status === 200) {
    return await response.json();
  }
  const data = await response.json().catch(() => ({}));
  const err = new Error(data.error || 'Failed to profile');
  err.errorType = data.error_type || (response.status === 504 ? 'timeout' : undefined);
  err.status = response.status;
  throw err;
};
