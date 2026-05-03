import { getUrl } from '../contexts/URLContext';

/**
 * Fetch dashboard data
 * @param {string} projectId - Project ID
 * @param {string} name - Dashboard name
 * @returns {Promise<Object>} Dashboard object with thumbnail URL
 */
export const fetchDashboard = async (projectId, name) => {
  // In server mode, this will call /api/dashboards/<name>/
  // In dist mode, this will fetch /data/dashboards/<name>.json
  let url = getUrl('dashboardQuery', { name });

  if (projectId) {
    const separator = url.includes('?') ? '&' : '?';
    url += `${separator}project_id=${encodeURIComponent(projectId)}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard data: ${response.status}`);
  }

  return await response.json();
};
