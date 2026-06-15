import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Fetch all LocalMergeModels with their status
 */
export const fetchAllLocalMergeModels = async (projectId = null) => {
  let url = getUrl('localMergeModelsList');
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch local merge models');
};

/**
 * Save a LocalMergeModel configuration to cache (draft state)
 */
export const saveLocalMergeModel = async (name, config, projectId = null) => {
  let url = getUrl('localMergeModelDetail', { name });
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
  throw new Error(errorData.error || 'Failed to save local merge model');
};

/**
 * Delete a LocalMergeModel (mark for deletion)
 */
export const deleteLocalMergeModel = async (name, projectId = null) => {
  let url = getUrl('localMergeModelDetail', { name });
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url, {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete local merge model');
};

/**
 * Validate a LocalMergeModel configuration without saving
 */
export const validateLocalMergeModel = async (name, config) => {
  const response = await apiFetch(getUrl('localMergeModelValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
