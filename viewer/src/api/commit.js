import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Check if there are any uncommitted changes
 */
export const getCommitStatus = async () => {
  const response = await apiFetch(getUrl('commitStatus'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to get commit status');
};

/**
 * Get all pending changes (objects with NEW, MODIFIED, or DELETED status)
 */
export const getPendingChanges = async () => {
  const response = await apiFetch(getUrl('commitPending'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to get pending changes');
};

/**
 * Commit all cached changes to YAML files
 */
export const commitChanges = async () => {
  const response = await apiFetch(getUrl('commit'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to commit changes');
};

/**
 * Discard all cached changes without writing YAML (the v1 rollback, Q14)
 */
export const discardChanges = async () => {
  const response = await apiFetch(getUrl('commitDiscard'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to discard changes');
};

/**
 * Discard the cached changes for a SINGLE object, reverting it to its published
 * version (per-object Discard). Universal across NEW/MODIFIED/DELETED — the
 * backend drops the object's draft entry so it falls back to published (or
 * disappears if it was newly created).
 */
export const discardObjectChanges = async (type, name) => {
  const response = await apiFetch(getUrl('commitDiscardObject', { type, name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || `Failed to discard changes to ${type} '${name}'`);
};
