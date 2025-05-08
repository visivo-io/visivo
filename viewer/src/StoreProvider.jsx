import { useEffect } from 'react';
import useStore from './stores/store';

export const StoreProvider = ({ children }) => {
  const setProjectData = useStore(state => state.setProjectData);
  const fetchNamedChildren = useStore(state => state.fetchNamedChildren);
  const fetchProjectFilePath = useStore(state => state.fetchProjectFilePath);
  const CreateProjectFileObjects = useStore(state => state.CreateProjectFileObjects);
  const fetchSchema = useStore(state => state.fetchSchema);

  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const response = await fetch('/data/project.json');
        if (!response.ok) {
          throw new Error('Failed to fetch project data');
        }
        const data = await response.json();
        setProjectData(data);
      } catch (error) {
        console.error('Error fetching project data:', error);
      }
    };

    const initializeStore = async () => {
      await fetchProjectFilePath();
      await fetchSchema();
      await fetchProjectData();
      await fetchNamedChildren();
      await CreateProjectFileObjects();
    };

    initializeStore();
  }, [
    fetchNamedChildren,
    setProjectData,
    fetchProjectFilePath,
    CreateProjectFileObjects,
    fetchSchema,
  ]);

  return children;
};
