import { getUrl } from '../config/urls';

/**
 * Fetch dashboard data
 * @param {string} projectId - Project ID
 * @param {string} name - Dashboard name
 * @returns {Promise<Object>} Dashboard object with thumbnail URL
 */
export const fetchDashboard = async (projectId, name) => {
  // In local mode, this will call /api/dashboard/{name}/
  // In dist mode, this will fetch /data/dashboard/{name}.json
  
  const url = new URL(getUrl('dashboardQuery', { name }), window.location.origin);
  
  if (projectId) {
    url.searchParams.append('project_id', projectId);
  }
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard data: ${response.status}`);
  }
  
  return await response.json();
};