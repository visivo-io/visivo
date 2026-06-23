import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Fetch the current project defaults
 */
export const fetchDefaults = async (projectId = null) => {
  let url = getUrl('defaults');
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch defaults');
};

/**
 * Save defaults configuration to cache (draft state)
 */
export const saveDefaults = async (config, projectId = null) => {
  let url = getUrl('defaults');
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
  throw new Error(errorData.error || 'Failed to save defaults');
};
