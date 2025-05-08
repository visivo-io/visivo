import { throwError } from '../api/utils';
import { fetchProject } from '../api/project';
import useStore from '../stores/store';

export const loadProject = async () => {
  const project = await fetchProject();
  if (project) {
    useStore.setState({ project });
    return project;
  } else {
    throwError('Project not found.', 404);
  }
};
