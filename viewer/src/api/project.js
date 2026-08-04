import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

// ============================================================
// Whole-project read
// ============================================================
//
// `/api/project/` returns the project envelope — `{id, name, status,
// project_dir, config: {defaults}, dashboard_count, source_count}`. Used by
// the project loader (loaders/project.js) and the onboarding/commonStore
// flow. It used to return the entire dereferenced project tree as one
// `project_json` blob; the fields above are what consumers actually read out
// of it. Resource lists come from their own endpoints, not from here.
export const fetchProjectBlob = async (projectId = null) => {
  let url = getUrl('project');
  if (projectId) url += `?project_id=${encodeURIComponent(projectId)}`;
  const response = await apiFetch(url);
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};

// ============================================================
// Canonical projects CRUD endpoints
// ============================================================

/**
 * List the projects in scope.
 *
 * Locally (visivo serve) this returns a list with one element — the
 * current project. In cloud (core) this returns the projects the
 * authenticated user can see in the active stage.
 *
 * Note: the list endpoint does NOT take a project_id — the concept of
 * "list, but only this one project" is incoherent. To fetch a single
 * project, use `fetchProject(id)`.
 */
export const fetchAllProjects = async () => {
  const url = getUrl('projectsList');
  const response = await apiFetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch projects');
};

/**
 * Fetch a single project by id.
 *
 * The id is the project's stable identifier — locally that's the project
 * name (visivo serve has one project, keyed by name); in cloud (core)
 * it's a UUID. Either way the URL shape is identical:
 * `/api/projects/<id>/`.
 *
 * Returns the canonical envelope: {id, name, status, config: {defaults}}.
 * Returns null on 404.
 */
export const fetchProject = async id => {
  const url = getUrl('projectDetail', { name: id });
  const response = await apiFetch(url);
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch project: ${id}`);
};

/**
 * Save a project configuration to cache (draft state)
 */
export const saveProject = async (name, config) => {
  const response = await apiFetch(getUrl('projectDetail', { name }), {
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
  const response = await apiFetch(getUrl('projectDetail', { name }), {
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
  const response = await apiFetch(getUrl('projectValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};
