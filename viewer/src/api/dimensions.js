import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all dimensions with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllDimensions = async () => {
  const response = await fetch(getUrl('dimensionsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch dimensions');
};

/**
 * Fetch a single dimension by name with status information
 */
export const fetchDimension = async name => {
  const response = await fetch(getUrl('dimensionDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch dimension: ${name}`);
};

/**
 * Save a dimension configuration to cache (draft state)
 */
export const saveDimension = async (name, config) => {
  const response = await fetch(getUrl('dimensionSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save dimension');
};

/**
 * Delete a dimension from cache (revert to published version)
 */
export const deleteDimension = async name => {
  const response = await fetch(getUrl('dimensionDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete dimension from cache');
};

/**
 * Validate a dimension configuration without saving
 */
export const validateDimension = async (name, config) => {
  const response = await fetch(getUrl('dimensionValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
