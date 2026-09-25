import { getUrl, isAvailable } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

/**
 * Rename a resource and rewrite every `${ref()}` that pointed at it.
 *
 * Local and cloud expose the same `{target, references}` contract
 * (`visivo/server/views/rename_views.py`, core's `ProjectRenameView`), so a
 * caller does not branch on environment.
 */

const NOT_SUPPORTED = {
  supported: false,
  target: null,
  references: [],
};

async function post(urlName, { type, oldName, newName, projectId }) {
  if (!isAvailable(urlName)) {
    return NOT_SUPPORTED;
  }
  // Studio serves one project and ignores the param; cloud serves many and
  // cannot resolve the draft without it. Omitting it 404'd every rename in
  // cloud, for every object type.
  const response = await apiFetch(withProjectId(getUrl(urlName), projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, old_name: oldName, new_name: newName }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Rename failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return { supported: true, ...body };
}

/**
 * What the rename would change, without changing it.
 *
 * Throws with `.status` on a rejection — notably 409 for a name collision, so
 * the caller can say so before the user confirms rather than after.
 *
 * @returns {Promise<{supported: boolean, target: object, references: Array}>}
 */
export const fetchRenameImpact = (type, oldName, newName, { projectId } = {}) =>
  post('renameImpact', { type, oldName, newName, projectId });

/** Apply the rename. Answers the same shape, describing what changed. */
export const renameResource = (type, oldName, newName, { projectId } = {}) =>
  post('rename', { type, oldName, newName, projectId });

/** Whether this server offers rename at all. */
export const renameSupported = () => isAvailable('rename');
