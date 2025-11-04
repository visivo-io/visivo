import { useEffect } from 'react';
import useStore from './stores/store';
import { fetchInputOptions, loadInputOptions } from './api/inputs';

export const StoreProvider = ({ children }) => {
  const fetchProject = useStore(state => state.fetchProject);
  const fetchNamedChildren = useStore(state => state.fetchNamedChildren);
  const fetchProjectFilePath = useStore(state => state.fetchProjectFilePath);
  const createProjectFileObjects = useStore(state => state.createProjectFileObjects);
  const fetchSchema = useStore(state => state.fetchSchema);
  const project = useStore(state => state.project);
  const db = useStore(state => state.db);
  const setInputOptions = useStore(state => state.setInputOptions);
  const setInputValue = useStore(state => state.setInputValue);

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

  // Initialize inputs after project and db are loaded
  useEffect(() => {
    const initializeInputs = async () => {
      if (!project || !db) {
        return;
      }

      const inputs = project.project_json?.inputs;
      if (!inputs || inputs.length === 0) {
        return;
      }

      console.debug(`Initializing ${inputs.length} inputs`);

      // Load options for each input
      for (const input of inputs) {
        try {
          // Fetch parquet URL for this input
          const url = await fetchInputOptions(project.project_json?.name, input.name_hash);

          // Load options from parquet file
          const options = await loadInputOptions(db, url);

          // Store options in state
          setInputOptions(input.name, options);

          // Set default value
          const defaultValue = input.default || options[0];
          if (defaultValue) {
            setInputValue(input.name, defaultValue);
          }

          console.debug(`Initialized input '${input.name}' with ${options.length} options`);
        } catch (error) {
          console.error(`Failed to initialize input '${input.name}':`, error);
        }
      }
    };

    initializeInputs();
  }, [project, db, setInputOptions, setInputValue]);

  return children;
};
