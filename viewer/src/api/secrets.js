/**
 * Store one secret value under a name. Contract:
 * docs/contracts/project-files-and-credentials.md
 */
import { getUrl } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

/** Resolves to the created secret's metadata. A failure carries `status` (409: the key exists). */
export const createSecret = async (key, value, { projectId = null } = {}) => {
  const response = await apiFetch(withProjectId(getUrl('secrets'), projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  const detail = body.error || body.errors;
  const error = new Error(typeof detail === 'string' ? detail : 'Could not store the secret');
  error.status = response.status;
  throw error;
};
