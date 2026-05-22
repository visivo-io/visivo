import { throwError } from '../api/utils';
import { fetchProjectBlob } from '../api/project';
import useStore from '../stores/store';

/**
 * Project view loader.
 *
 * Currently still fetches the legacy `/api/project/` bulk-blob endpoint —
 * ProjectContainer (the legacy view) consumes it via `useLoaderData` and
 * reads `project.project_json.dashboards` directly. When ProjectContainer
 * is cut over to ProjectNew, swap the call below for `fetchProject(id)`
 * (the canonical per-resource detail endpoint) and the loader's return
 * value becomes the slim envelope `{id, name, status, config: {defaults}}`.
 *
 * The `id` is whatever the URL identifies the project as: locally that's
 * the project name (visivo serve has one project, keyed by name), in
 * cloud it's a UUID. The loader picks it up from `?project_id=` or, in
 * single-project mode, falls back to fetching the projects list and
 * taking the first.
 */
export const loadProject = async ({ request } = {}) => {
  const projectId = request ? new URL(request.url).searchParams.get('project_id') : null;
  const project = await fetchProjectBlob(projectId);
  if (project) {
    useStore.setState({ project });
    return project;
  } else {
    throwError('Project not found.', 404);
  }
};
