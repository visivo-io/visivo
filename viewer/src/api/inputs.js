import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all inputs with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllInputs = async () => {
  const response = await fetch(getUrl('inputsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch inputs');
};

/**
 * Fetch a single input by name with status information
 */
export const fetchInput = async name => {
  const response = await fetch(getUrl('inputDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch input: ${name}`);
};

/**
 * Save an input configuration to cache (draft state)
 */
export const saveInput = async (name, config) => {
  const response = await fetch(getUrl('inputSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save input');
};

/**
 * Delete an input from cache (revert to published version)
 */
export const deleteInput = async name => {
  const response = await fetch(getUrl('inputDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete input from cache');
};

/**
 * Validate an input configuration without saving
 */
export const validateInput = async (name, config) => {
  const response = await fetch(getUrl('inputValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
