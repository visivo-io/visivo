import { getUrl } from '../contexts/URLContext';

/**
 * Fetch insights data
 * @param {string} projectId - Project ID
 * @param {string[]} names - Array of insight names
 * @returns {Promise<Object[]>} Array of insight objects with data URLs
 */
export const fetchInsights = async (projectId, names) => {
  // In server mode, this will call /api/insights/ with insight names as query params
  // In dist mode, this will fetch /data/insights.json

  let url = getUrl('insightsQuery');
  const params = [];

  // Add insight names as query parameters for server mode
  if (names && names.length > 0) {
    names.forEach(name => params.push(`insight_names=${encodeURIComponent(name)}`));
  }

  if (projectId) {
    params.push(`project_id=${encodeURIComponent(projectId)}`);
  }

  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch insights data: ${response.status}`);
  }

  const data = await response.json();

  // Ensure data is in the expected format
  if (Array.isArray(data)) {
    return data;
  }

  // Transform single object to array if needed
  return [data];
};
