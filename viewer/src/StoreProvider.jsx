import { useEffect } from 'react';
import useStore from './stores/store';

export const StoreProvider = ({ children }) => {
  const fetchProject = useStore(state => state.fetchProject);
  const fetchProjectFilePath = useStore(state => state.fetchProjectFilePath);

  useEffect(() => {
    const initializeStore = async () => {
      await fetchProjectFilePath();
      await fetchProject();
    };

    initializeStore();
  }, [fetchProject, fetchProjectFilePath]);

  return children;
};
