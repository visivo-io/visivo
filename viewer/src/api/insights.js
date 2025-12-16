import { getUrl } from '../contexts/URLContext';

/**
 * Validates an insight object has the required structure
 * @param {Object} insight - Insight object to validate
 * @returns {boolean} True if valid
 */
const validateInsightStructure = insight => {
  if (!insight.name) {
    console.warn('Insight missing name:', insight);
    return false;
  }

  // Check for new structure (files, query, props_mapping)
  if (!insight.files || !Array.isArray(insight.files)) {
    console.warn(`Insight '${insight.name}' missing files array:`, insight);
    return false;
  }

  if (!insight.query) {
    console.warn(`Insight '${insight.name}' missing query:`, insight);
    return false;
  }

  if (!insight.props_mapping || typeof insight.props_mapping !== 'object') {
    console.warn(`Insight '${insight.name}' missing or invalid props_mapping:`, insight);
    return false;
  }

  // Validate file structure
  for (const file of insight.files) {
    if (!file.name_hash) {
      console.warn(`File missing name_hash in insight '${insight.name}':`, file);
      return false;
    }
    if (!file.signed_data_file_url) {
      console.warn(`File missing signed_data_file_url in insight '${insight.name}':`, file);
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
    console.warn('fetchInsights called with empty names array');
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
      console.debug(`Fetching insights (attempt ${attempt + 1}/${retries}):`, names);

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
      const validInsights = insights.filter(insight => {
        const isValid = validateInsightStructure(insight);
        if (!isValid) {
          console.error(`Invalid insight structure for '${insight.name}'`);
        }
        return isValid;
      });

      if (validInsights.length === 0) {
        throw new Error('No valid insights returned from server');
      }

      if (validInsights.length < insights.length) {
        console.warn(
          `${insights.length - validInsights.length} insights failed validation and were excluded`
        );
      }

      console.debug(
        `Successfully fetched ${validInsights.length} insights:`,
        validInsights.map(i => i.name)
      );

      return validInsights;
    } catch (error) {
      lastError = error;
      console.error(`Fetch attempt ${attempt + 1} failed:`, error);

      if (attempt < retries - 1) {
        console.debug(`Retrying in ${retryDelay}ms...`);
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
