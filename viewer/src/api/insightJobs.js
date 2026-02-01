import { getUrl } from '../contexts/URLContext';
import { DEFAULT_RUN_ID } from '../constants';

/**
 * Validates an insight job object has the required structure
 * @param {Object} insightJob - Insight job object to validate
 * @returns {boolean} True if valid
 */
const validateInsightJobStructure = insightJob => {
  const insight = insightJob; // alias for clarity in validation messages
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
 * Fetch insight jobs data with retry logic
 * @param {string} projectId - Project ID
 * @param {string[]} names - Array of insight names
 * @param {string} runId - Run ID to fetch data from (default: "main")
 * @param {number} retries - Number of retries (default 3)
 * @param {number} retryDelay - Delay between retries in ms (default 1000)
 * @returns {Promise<Object[]>} Array of insight job objects with data URLs
 */
export const fetchInsightJobs = async (projectId, names, runId = DEFAULT_RUN_ID, retries = 3, retryDelay = 1000) => {
  // In server mode, this will call /api/insight-jobs/ with insight names as query params
  // In dist mode, this will fetch /data/insights.json

  if (!names || names.length === 0) {
    console.warn('fetchInsightJobs called with empty names array');
    return [];
  }

  let url = getUrl('insightJobsQuery');
  const params = [];

  // Add insight names as query parameters for server mode
  names.forEach(name => params.push(`insight_names=${encodeURIComponent(name)}`));

  if (projectId) {
    params.push(`project_id=${encodeURIComponent(projectId)}`);
  }

  // Add run_id parameter
  if (runId) {
    params.push(`run_id=${encodeURIComponent(runId)}`);
  }

  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.debug(`Fetching insight jobs (attempt ${attempt + 1}/${retries}):`, names);

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch insight jobs data: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const data = await response.json();

      let insightJobs = Array.isArray(data) ? data : [data];

      const validInsightJobs = insightJobs.filter(insightJob => {
        const isValid = validateInsightJobStructure(insightJob);
        if (!isValid) {
          console.error(`Invalid insight job structure for '${insightJob.name}'`);
        }
        return isValid;
      });

      if (validInsightJobs.length === 0) {
        throw new Error('No valid insight jobs returned from server');
      }

      if (validInsightJobs.length < insightJobs.length) {
        console.warn(
          `${insightJobs.length - validInsightJobs.length} insight jobs failed validation and were excluded`
        );
      }

      console.debug(
        `Successfully fetched ${validInsightJobs.length} insight jobs:`,
        validInsightJobs.map(i => i.name)
      );

      return validInsightJobs;
    } catch (error) {
      lastError = error;
      console.error(`Fetch attempt ${attempt + 1} failed:`, error);

      if (attempt < retries - 1) {
        console.debug(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(`Failed to fetch insight jobs after ${retries} attempts: ${lastError.message}`);
};

// Backward compatibility alias
export const fetchInsights = fetchInsightJobs;
