import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all charts with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllCharts = async () => {
  const response = await fetch(getUrl('chartsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch charts');
};

/**
 * Fetch a single chart by name with status information
 */
export const fetchChart = async name => {
  const response = await fetch(getUrl('chartDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch chart: ${name}`);
};

/**
 * Save a chart configuration to cache (draft state)
 */
export const saveChart = async (name, config) => {
  const response = await fetch(getUrl('chartSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save chart');
};

/**
 * Delete a chart from cache (revert to published version)
 */
export const deleteChart = async name => {
  const response = await fetch(getUrl('chartDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete chart from cache');
};

/**
 * Validate a chart configuration without saving
 */
export const validateChart = async (name, config) => {
  const response = await fetch(getUrl('chartValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
