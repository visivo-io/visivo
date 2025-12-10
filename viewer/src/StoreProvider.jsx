import { useEffect } from 'react';
import useStore from './stores/store';

export const StoreProvider = ({ children }) => {
  const fetchProject = useStore(state => state.fetchProject);
  const fetchNamedChildren = useStore(state => state.fetchNamedChildren);
  const fetchProjectFilePath = useStore(state => state.fetchProjectFilePath);
  const createProjectFileObjects = useStore(state => state.createProjectFileObjects);
  const fetchSchema = useStore(state => state.fetchSchema);

  useEffect(() => {
    const initializeStore = async () => {
      await fetchProjectFilePath();
      await fetchSchema();
      await fetchProject();
      await fetchNamedChildren();
      await createProjectFileObjects();
    };

    initializeStore();
  }, [
    fetchNamedChildren,
    fetchProject,
    fetchProjectFilePath,
    createProjectFileObjects,
    fetchSchema,
  ]);

  return children;
};
