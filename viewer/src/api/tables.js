import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all tables with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllTables = async () => {
  const response = await fetch(getUrl('tablesList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch tables');
};

/**
 * Fetch a single table by name with status information
 */
export const fetchTable = async name => {
  const response = await fetch(getUrl('tableDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch table: ${name}`);
};

/**
 * Save a table configuration to cache (draft state)
 */
export const saveTable = async (name, config) => {
  const response = await fetch(getUrl('tableSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save table');
};

/**
 * Delete a table from cache (revert to published version)
 */
export const deleteTable = async name => {
  const response = await fetch(getUrl('tableDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete table from cache');
};

/**
 * Validate a table configuration without saving
 */
export const validateTable = async (name, config) => {
  const response = await fetch(getUrl('tableValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
