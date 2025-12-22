import { getUrl } from '../contexts/URLContext';

/**
 * Validates an insight object has the required structure
 * @param {Object} insight - Insight object to validate
 * @returns {boolean} True if valid
 */
const validateInsightStructure = insight => {
  if (!insight.name) {
    return false;
  }

  // Check for new structure (files, query, props_mapping)
  if (!insight.files || !Array.isArray(insight.files)) {
    return false;
  }

  if (!insight.query) {
    return false;
  }

  if (!insight.props_mapping || typeof insight.props_mapping !== 'object') {
    return false;
  }

  // Validate file structure
  for (const file of insight.files) {
    if (!file.name_hash) {
      return false;
    }
    if (!file.signed_data_file_url) {
      return false;
    }
  }

  return true;
};

/**
 * Fetch insights data with retry logic
 * @param {string} projectId - Project ID
 * @param {string[]} names - Array of insight names
 * @param {number} retries - Number of retries (default 3)
 * @param {number} retryDelay - Delay between retries in ms (default 1000)
 * @returns {Promise<Object[]>} Array of insight objects with data URLs
 */
export const fetchInsights = async (projectId, names, retries = 3, retryDelay = 1000) => {
  // In server mode, this will call /api/insights/ with insight names as query params
  // In dist mode, this will fetch /data/insights.json

  if (!names || names.length === 0) {
    return [];
  }

  let url = getUrl('insightsQuery');
  const params = [];

  // Add insight names as query parameters for server mode
  names.forEach(name => params.push(`insight_names=${encodeURIComponent(name)}`));

  if (projectId) {
    params.push(`project_id=${encodeURIComponent(projectId)}`);
  }

  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch insights data: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const data = await response.json();

      // Ensure data is in the expected format
      let insights = Array.isArray(data) ? data : [data];

      // Validate each insight
      const validInsights = insights.filter(insight => validateInsightStructure(insight));

      if (validInsights.length === 0) {
        throw new Error('No valid insights returned from server');
      }

      return validInsights;
    } catch (error) {
      lastError = error;

      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(`Failed to fetch insights after ${retries} attempts: ${lastError.message}`);
};

/**
 * Compute name hash for a given insight or model name
 * @param {string} name - Name to hash
 * @returns {Promise<string>} Name hash
 */
export const computeNameHash = async name => {
  const url = getUrl('server') + '/api/insights/hash';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(`Failed to compute hash: ${response.status}`);
  }

  const data = await response.json();
  return data.name_hash;
};
