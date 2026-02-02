import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all CsvScriptModels with their status
 */
export const fetchAllCsvScriptModels = async () => {
  const response = await fetch(getUrl('csvScriptModelsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch csv script models');
};

/**
 * Save a CsvScriptModel configuration to cache (draft state)
 */
export const saveCsvScriptModel = async (name, config) => {
  const response = await fetch(getUrl('csvScriptModelSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save csv script model');
};

/**
 * Delete a CsvScriptModel (mark for deletion)
 */
export const deleteCsvScriptModel = async name => {
  const response = await fetch(getUrl('csvScriptModelDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete csv script model');
};

/**
 * Validate a CsvScriptModel configuration without saving
 */
export const validateCsvScriptModel = async (name, config) => {
  const response = await fetch(getUrl('csvScriptModelValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
