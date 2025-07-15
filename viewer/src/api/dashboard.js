import { getUrl } from '../config/urls';
import md5 from 'md5';

/**
 * Fetch dashboard query data
 * @param {string} projectId - Project ID
 * @param {string} name - Dashboard name
 * @returns {Promise<Object>} Dashboard object with thumbnail URL
 */
export const fetchDashboardQuery = async (projectId, name) => {
  // In local mode, this will call /api/dashboard/{name}/
  // In dist mode, this will fetch /data/dashboard/{name}.json
  
  const url = new URL(getUrl('dashboardQuery', { name }), window.location.origin);
  
  if (projectId) {
    url.searchParams.append('project_id', projectId);
  }
  
  const response = await fetch(url.toString());
  
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error('Failed to fetch dashboard query data');
    // Fallback to generating the expected structure
    const hash = md5(name);
    return {
      name: name,
      id: name,
      signed_thumbnail_file_url: getUrl('dashboardThumbnail', { hash }),
    };
  }
};

/**
 * Create a React Query configuration for dashboard
 * @param {string} projectId - Project ID
 * @param {string} name - Dashboard name
 * @returns {object} React Query configuration
 */
export const createDashboardQuery = (projectId, name) => ({
  queryKey: ['dashboard', projectId, name],
  queryFn: () => fetchDashboardQuery(projectId, name),
});