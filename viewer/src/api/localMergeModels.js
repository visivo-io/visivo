import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all LocalMergeModels with their status
 */
export const fetchAllLocalMergeModels = async () => {
  const response = await fetch(getUrl('localMergeModelsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch local merge models');
};

/**
 * Save a LocalMergeModel configuration to cache (draft state)
 */
export const saveLocalMergeModel = async (name, config) => {
  const response = await fetch(getUrl('localMergeModelSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save local merge model');
};

/**
 * Delete a LocalMergeModel (mark for deletion)
 */
export const deleteLocalMergeModel = async name => {
  const response = await fetch(getUrl('localMergeModelDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete local merge model');
};

/**
 * Validate a LocalMergeModel configuration without saving
 */
export const validateLocalMergeModel = async (name, config) => {
  const response = await fetch(getUrl('localMergeModelValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
