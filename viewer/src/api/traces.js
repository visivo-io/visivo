import { getUrl } from '../config/urls';

/**
 * Fetch traces data
 * @param {string} projectId - Project ID
 * @param {string[]} names - Array of trace names
 * @returns {Promise<Object[]>} Array of trace objects with data URLs
 */
export const fetchTraces = async (projectId, names) => {
  // In local mode, this will call /api/traces/ with trace names as query params
  // In dist mode, this will fetch /data/traces.json
  
  const url = new URL(getUrl('tracesQuery'), window.location.origin);
  
  // Add trace names as query parameters for local mode
  if (names && names.length > 0) {
    names.forEach(name => url.searchParams.append('names', name));
  }
  
  if (projectId) {
    url.searchParams.append('project_id', projectId);
  }
  
  const response = await fetch(url.toString());
  
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