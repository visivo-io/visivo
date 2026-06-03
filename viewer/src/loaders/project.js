import { throwError } from '../api/utils';
import { fetchProjectBlob } from '../api/project';
import useStore from '../stores/store';

/**
 * Project view loader.
 *
 * Currently still fetches the legacy `/api/project/` bulk-blob endpoint and
 * stashes it on the store as `project`; the Project view reads dashboards
 * from their own store slice and tolerates either envelope shape. Swapping
 * the call below for `fetchProject(id)` (the canonical per-resource detail
 * endpoint) would slim the return to `{id, name, status, config: {defaults}}`.
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
