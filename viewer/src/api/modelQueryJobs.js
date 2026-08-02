import { getUrl } from '../contexts/URLContext.jsx';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

/**
 * Start a new SQL query execution job
 * @param {string} sourceName - Name of the source to query
 * @param {string} sql - SQL query to execute
 * @returns {Promise<{job_id: string, status: string}>}
 */
export const startModelQueryJob = async (sourceName, sql, projectId = null) => {
  const url = withProjectId(getUrl('modelQueryJobs'), projectId);

  const response = await apiFetch(url, {
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
export const getModelQueryJobStatus = async (jobId, projectId = null) => {
  const url = withProjectId(getUrl('modelQueryJobDetail', { jobId }), projectId);

  const response = await apiFetch(url);

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
export const cancelModelQueryJob = async (jobId, projectId = null) => {
  const url = withProjectId(getUrl('modelQueryJobDetail', { jobId }), projectId);

  const response = await apiFetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to cancel job: ${response.status}`);
  }

  return response.json();
};
