/**
 * Store a source form's typed credentials and get back the config that
 * references them. Contract: docs/contracts/project-files-and-credentials.md
 */
import { getUrl } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

/** Returns `{source, credentials}`; send `source` on to test and save. */
export const prepareSourceCredentials = async (source, { projectId = null } = {}) => {
  const response = await apiFetch(withProjectId(getUrl('sourceCredentials'), projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || 'Could not store the credentials');
  error.code = body.code || null;
  error.status = response.status;
  throw error;
};
