import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all models with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllModels = async () => {
  const response = await fetch(getUrl('modelsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch models');
};

/**
 * Fetch a single model by name with status information
 */
export const fetchModel = async name => {
  const response = await fetch(getUrl('modelDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch model: ${name}`);
};

/**
 * Save a model configuration to cache (draft state)
 */
export const saveModel = async (name, config) => {
  const response = await fetch(getUrl('modelSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save model');
};

/**
 * Delete a model from cache (revert to published version)
 */
export const deleteModel = async name => {
  const response = await fetch(getUrl('modelDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete model from cache');
};

/**
 * Validate a model configuration without saving
 */
export const validateModel = async (name, config) => {
  const response = await fetch(getUrl('modelValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
