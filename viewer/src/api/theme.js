import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

const themeUrl = projectId => {
  const url = getUrl('theme');
  return projectId ? `${url}?project_id=${encodeURIComponent(projectId)}` : url;
};

export const fetchTheme = async (projectId = null) => {
  const response = await apiFetch(themeUrl(projectId));
  if (response.status === 200) return await response.json();
  throw new Error('Failed to fetch theme');
};

export const saveTheme = async (config, projectId = null) => {
  const response = await apiFetch(themeUrl(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (response.status === 200) return await response.json();
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to save theme');
};
