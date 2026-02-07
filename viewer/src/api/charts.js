import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all charts with their status (NEW, MODIFIED, PUBLISHED)
 * @param {string} projectId - Project ID (required for Django/deployed mode, optional for Flask/dev mode)
 */
export const fetchAllCharts = async (projectId = null) => {
  const queryParams = projectId ? { project_id: projectId } : {};
  const response = await fetch(getUrl('chartsList', {}, queryParams));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch charts');
};

/**
 * Fetch a single chart by name with status information
 * @param {string} name - Chart name
 * @param {string} projectId - Project ID (required for Django/deployed mode, optional for Flask/dev mode)
 */
export const fetchChart = async (name, projectId = null) => {
  const queryParams = projectId ? { project_id: projectId } : {};
  const response = await fetch(getUrl('chartDetail', { name }, queryParams));
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
 * @param {string} name - Chart name
 * @param {object} config - Chart configuration
 * @param {string} projectId - Project ID (required for Django/deployed mode, optional for Flask/dev mode)
 */
export const saveChart = async (name, config, projectId = null) => {
  const queryParams = projectId ? { project_id: projectId } : {};
  const response = await fetch(getUrl('chartSave', { name }, queryParams), {
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
 * @param {string} name - Chart name
 * @param {string} projectId - Project ID (required for Django/deployed mode, optional for Flask/dev mode)
 */
export const deleteChart = async (name, projectId = null) => {
  const queryParams = projectId ? { project_id: projectId } : {};
  const response = await fetch(getUrl('chartDetail', { name }, queryParams), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete chart from cache');
};

/**
 * Validate a chart configuration without saving
 * @param {string} name - Chart name
 * @param {object} config - Chart configuration to validate
 * @param {string} projectId - Project ID (required for Django/deployed mode, optional for Flask/dev mode)
 */
export const validateChart = async (name, config, projectId = null) => {
  const queryParams = projectId ? { project_id: projectId } : {};
  const response = await fetch(getUrl('chartValidate', { name }, queryParams), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
