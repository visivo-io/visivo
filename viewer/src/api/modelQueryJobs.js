import { getUrl } from '../contexts/URLContext.jsx';

/**
 * Start a new SQL query execution job
 * @param {string} sourceName - Name of the source to query
 * @param {string} sql - SQL query to execute
 * @returns {Promise<{job_id: string, status: string}>}
 */
export const startModelQueryJob = async (sourceName, sql) => {
  const url = getUrl('modelQueryJobs');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_name: sourceName,
      sql,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to start query job: ${response.status}`);
  }

  return response.json();
};

/**
 * Get status and results of a query job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Job status and results
 */
export const getModelQueryJobStatus = async jobId => {
  const url = getUrl('modelQueryJobDetail', { jobId });

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to get job status: ${response.status}`);
  }

  return response.json();
};

/**
 * Cancel a running query job
 * @param {string} jobId - Job ID
 * @returns {Promise<{message: string, job_id: string}>}
 */
export const cancelModelQueryJob = async jobId => {
  const url = getUrl('modelQueryJobDetail', { jobId });

  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to cancel job: ${response.status}`);
  }

  return response.json();
};

/**
 * Poll a query job until completion
 * @param {string} jobId - Job ID
 * @param {Object} options - Polling options
 * @param {number} options.interval - Polling interval in ms (default 500)
 * @param {number} options.maxAttempts - Max polling attempts (default 600 = 5 min at 500ms)
 * @param {Function} options.onProgress - Callback for progress updates
 * @returns {Promise<Object>} Final job result
 */
export const pollModelQueryJob = async (jobId, options = {}) => {
  const { interval = 500, maxAttempts = 600, onProgress } = options;

  let attempts = 0;

  while (attempts < maxAttempts) {
    const status = await getModelQueryJobStatus(jobId);

    if (onProgress) {
      onProgress(status);
    }

    if (status.status === 'completed') {
      return status;
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(status.error || `Job ${status.status}`);
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Job timed out');
};
