import { getUrl } from '../contexts/URLContext';

/**
 * Check if there are any unpublished changes
 */
export const getPublishStatus = async () => {
  const response = await fetch(getUrl('publishStatus'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to get publish status');
};

/**
 * Get all pending changes (objects with NEW, MODIFIED, or DELETED status)
 */
export const getPendingChanges = async () => {
  const response = await fetch(getUrl('publishPending'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to get pending changes');
};

/**
 * Publish all cached changes to YAML files
 */
export const publishChanges = async () => {
  const response = await fetch(getUrl('publish'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to publish changes');
};
