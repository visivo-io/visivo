import { getUrl } from '../contexts/URLContext';
import md5 from 'md5';

/**
 * Fetch dashboard data
 * @param {string} projectId - Project ID
 * @param {string} name - Dashboard name
 * @returns {Promise<Object>} Dashboard object with thumbnail URL
 */
export const fetchDashboard = async (projectId, name) => {
  // Calculate hash from dashboard name for consistent URL generation
  const nameHash = md5(name);
  
  // In server mode, this will call /api/dashboard/{hash}.json
  // In dist mode, this will fetch /data/dashboard/{hash}.json
  let url = getUrl('dashboardQuery', { hash: nameHash });
  
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