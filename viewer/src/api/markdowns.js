import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all markdowns with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllMarkdowns = async () => {
  const response = await fetch(getUrl('markdownsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch markdowns');
};

/**
 * Fetch a single markdown by name with status information
 */
export const fetchMarkdown = async name => {
  const response = await fetch(getUrl('markdownDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch markdown: ${name}`);
};

/**
 * Save a markdown configuration to cache (draft state)
 */
export const saveMarkdown = async (name, config) => {
  const response = await fetch(getUrl('markdownSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save markdown');
};

/**
 * Delete a markdown from cache (revert to published version)
 */
export const deleteMarkdown = async name => {
  const response = await fetch(getUrl('markdownDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete markdown from cache');
};

/**
 * Validate a markdown configuration without saving
 */
export const validateMarkdown = async (name, config) => {
  const response = await fetch(getUrl('markdownValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
