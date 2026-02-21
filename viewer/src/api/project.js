import { getUrl } from '../contexts/URLContext';

// ========== Old project endpoint (for backward compatibility) ==========
export const fetchProject = async (projectId = null) => {
  let url = getUrl('project');
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await fetch(url);
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};

// ========== New projects CRUD endpoints ==========

/**
 * Fetch all projects with status (list endpoint)
 * Locally returns one project, in cloud can return multiple
 */
export const fetchAllProjects = async (projectId = null) => {
  let url = getUrl('projectsList');
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await fetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch projects');
};

/**
 * Fetch a single project by name with status information
 */
export const fetchProjectByName = async (name, projectId = null) => {
  let url = getUrl('projectDetail', { name });
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await fetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch project: ${name}`);
};

/**
 * Save a project configuration to cache (draft state)
 */
export const saveProject = async (name, config) => {
  const response = await fetch(getUrl('projectSave', { name }), {
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
  throw new Error(errorData.error || 'Failed to save project');
};

/**
 * Delete a project from cache (revert to published version)
 */
export const deleteProject = async name => {
  const response = await fetch(getUrl('projectDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete project from cache');
};

/**
 * Validate a project configuration without saving
 */
export const validateProject = async (name, config) => {
  const response = await fetch(getUrl('projectValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
