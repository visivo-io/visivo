import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all metrics with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllMetrics = async () => {
  const response = await fetch(getUrl('metricsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch metrics');
};

/**
 * Fetch a single metric by name with status information
 */
export const fetchMetric = async name => {
  const response = await fetch(getUrl('metricDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch metric: ${name}`);
};

/**
 * Save a metric configuration to cache (draft state)
 */
export const saveMetric = async (name, config) => {
  const response = await fetch(getUrl('metricSave', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to save metric');
};

/**
 * Delete a metric from cache (revert to published version)
 */
export const deleteMetric = async name => {
  const response = await fetch(getUrl('metricDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete metric from cache');
};

/**
 * Validate a metric configuration without saving
 */
export const validateMetric = async (name, config) => {
  const response = await fetch(getUrl('metricValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
