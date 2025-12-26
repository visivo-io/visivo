import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all relations with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllRelations = async () => {
  const response = await fetch(getUrl('relationsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch relations');
};

/**
 * Fetch a single relation by name with status information
 */
export const fetchRelation = async name => {
  const response = await fetch(getUrl('relationDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch relation: ${name}`);
};

/**
 * Save a relation configuration to cache (draft state)
 */
export const saveRelation = async (name, config) => {
  const response = await fetch(getUrl('relationSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save relation');
};

/**
 * Delete a relation from cache (revert to published version)
 */
export const deleteRelation = async name => {
  const response = await fetch(getUrl('relationDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete relation from cache');
};

/**
 * Validate a relation configuration without saving
 */
export const validateRelation = async (name, config) => {
  const response = await fetch(getUrl('relationValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
