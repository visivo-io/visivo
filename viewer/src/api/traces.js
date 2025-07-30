import { getUrl } from '../contexts/URLContext';

/**
 * Fetch traces data
 * @param {string} projectId - Project ID
 * @param {string[]} names - Array of trace names
 * @returns {Promise<Object[]>} Array of trace objects with data URLs
 */
export const fetchTraces = async (projectId, names) => {
  // In server mode, this will call /api/traces/ with trace names as query params
  // In dist mode, this will fetch /data/traces.json
  
  let url = getUrl('tracesQuery');
  const params = [];
  
  // Add trace names as query parameters for server mode
  if (names && names.length > 0) {
    names.forEach(name => params.push(`trace_names=${encodeURIComponent(name)}`));
  }
  
  if (projectId) {
    params.push(`project_id=${encodeURIComponent(projectId)}`);
  }
  
  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch traces data: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Ensure data is in the expected format
  if (Array.isArray(data)) {
    return data;
  }
  
  // Transform single object to array if needed
  return [data];
};