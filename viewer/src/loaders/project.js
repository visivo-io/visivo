import { throwError } from '../api/utils';
import { fetchProject, fetchAllProjects } from '../api/project';
import useStore from '../stores/store';

/**
 * Legacy loader — fetches the giant `project.json` blob and exposes it via
 * `useLoaderData()` to ProjectContainer. New views should use `loadProjectMeta`
 * below; this stays until ProjectContainer is removed in the cutover phase.
 */
export const loadProject = async ({ request } = {}) => {
  const projectId = request ? new URL(request.url).searchParams.get('project_id') : null;
  const project = await fetchProject(projectId);
  if (project) {
    useStore.setState({ project });
    return project;
  } else {
    throwError('Project not found.', 404);
  }
};

/**
 * Slim loader — fetches the project list endpoint and stores only
 * `{id, name}` on `state.project`. Use this for any route whose component
 * only needs the project identity (project id is forwarded as `?project_id=`
 * on per-resource API calls; the actual data comes from per-resource stores).
 *
 * In single-project mode (visivo serve) the list returns one project — we
 * pick it. In multi-tenant mode (core) the list returns the user's projects
 * and we pick the one matching `?project_id=` on the URL, falling back to
 * the first.
 */
export const loadProjectMeta = async ({ request } = {}) => {
  const projectId = request ? new URL(request.url).searchParams.get('project_id') : null;
  let data;
  try {
    data = await fetchAllProjects(projectId);
  } catch (e) {
    throwError(e?.message || 'Failed to fetch project metadata.', 500);
  }
  const projects = (data && data.projects) || [];
  if (projects.length === 0) {
    throwError('No projects available.', 404);
  }
  const matched = projectId ? projects.find(p => p.id === projectId) : null;
  const project = matched || projects[0];
  const slim = { id: project.id, name: project.name };
  useStore.setState({ project: slim });
  return slim;
};
