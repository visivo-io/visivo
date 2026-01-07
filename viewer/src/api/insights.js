import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all insights with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllInsights = async () => {
  const response = await fetch(getUrl('insightsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch insights');
};

/**
 * Fetch a single insight by name with status information
 */
export const fetchInsight = async name => {
  const response = await fetch(getUrl('insightDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch insight: ${name}`);
};

/**
 * Save an insight configuration to cache (draft state)
 */
export const saveInsight = async (name, config) => {
  const response = await fetch(getUrl('insightSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save insight');
};

/**
 * Delete an insight from cache (revert to published version)
 */
export const deleteInsight = async name => {
  const response = await fetch(getUrl('insightDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete insight from cache');
};

/**
 * Validate an insight configuration without saving
 */
export const validateInsight = async (name, config) => {
  const response = await fetch(getUrl('insightValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
