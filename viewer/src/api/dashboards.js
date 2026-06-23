import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Fetch all dashboards with their status
 */
export const fetchAllDashboards = async (projectId = null) => {
  let url = getUrl('dashboardsList');
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch dashboards');
};

/**
 * Save a dashboard configuration to cache (draft state)
 */
export const saveDashboard = async (name, config, projectId = null) => {
  let url = getUrl('dashboardSave', { name });
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url, {
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
  throw new Error(errorData.error || 'Failed to save dashboard');
};

/**
 * Delete a dashboard (mark for deletion)
 */
export const deleteDashboard = async (name, projectId = null) => {
  let url = getUrl('dashboardDelete', { name });
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url, {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete dashboard');
};

/**
 * Validate a dashboard configuration without saving
 */
export const validateDashboard = async (name, config) => {
  const response = await apiFetch(getUrl('dashboardValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
