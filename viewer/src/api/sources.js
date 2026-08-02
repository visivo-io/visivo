import { getUrl } from '../contexts/URLContext';
import { runOnDemandJob } from './jobs';
import { apiFetch } from './utils';

/**
 * Fetch all sources with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllSources = async (projectId = null) => {
  let url = getUrl('sourcesList');
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch sources');
};

/**
 * Fetch a single source by name with status information
 */
export const fetchSource = async name => {
  const response = await apiFetch(getUrl('sourceDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch source: ${name}`);
};

/**
 * Save a source configuration to cache (draft state)
 */
export const saveSource = async (name, config, projectId = null) => {
  let url = getUrl('sourceDetail', { name });
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to save source');
};

/**
 * Delete a source from cache (revert to published version)
 */
export const deleteSource = async (name, projectId = null) => {
  let url = getUrl('sourceDetail', { name });
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url, {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete source from cache');
};

/**
 * Validate a source configuration without saving
 */
export const validateSource = async (name, config) => {
  const response = await apiFetch(getUrl('sourceValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};

/**
 * Test a source connection from configuration.
 *
 * Asynchronous on both servers: the POST answers `202 {job_id}` and the job is
 * polled at `<path><job_id>/`. Cloud has no alternative — the test runs on a
 * warm runner pool whose pods deny all ingress, so there is no request it could
 * hold open — and the local server matches so there is one code path.
 *
 * The return shape is unchanged, so callers (`sourceStore.testConnection`,
 * `SourceEditForm`, `SourceEditorModal`) are untouched: the resolved result on
 * success, `{status: 'connection_failed', error}` otherwise. A rejected request
 * and a refused connection look the same to the form, which is right — both
 * mean "didn't connect", and the error text says which.
 */
export const testSourceConnection = async config => {
  const path = getUrl('sourceConnections');
  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const job = await runOnDemandJob(path, response);
  return job.ok
    ? job.result
    : { status: 'connection_failed', error: job.error || 'Connection test failed' };
};
