import { apiFetch } from './utils';

/**
 * Undo a pending deletion for one object.
 *
 * Deleting is a soft delete: the object is tombstoned and only leaves the
 * project when a commit runs. Until then it is a pending change like any other
 * — and every other pending change can be reverted. This one could not. The
 * single escape was discarding EVERY pending change, so recovering one
 * accidental delete cost the user all of their unrelated work (VIS-1234).
 *
 * One helper rather than eleven per-type ones: both servers expose the same
 * `POST /api/<segment>/<name>/restore/`, and the segment is the plural of the
 * type for every resource — the same derivation `RESOURCE_TYPE_NAMES` makes on
 * the server.
 */
const segmentFor = type => `${type}s`;

export const restoreObject = async (type, name, projectId = null) => {
  let url = `/api/${segmentFor(type)}/${encodeURIComponent(name)}/restore/`;
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;

  const response = await apiFetch(url, { method: 'POST' });
  if (response.status === 200) {
    return await response.json();
  }
  const body = await response.json().catch(() => ({}));
  throw new Error(body.error || `Failed to restore ${type} '${name}'`);
};

export default restoreObject;
