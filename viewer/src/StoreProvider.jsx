import { useEffect } from "react";
import useStore from "./stores/store";
import { fetchProject } from "./api/project";

export const StoreProvider = ({ children }) => {
  const setProjectData = useStore((state) => state.setProjectData);
  const fetchNamedChildren = useStore((state) => state.fetchNamedChildren);
  const fetchProjectFilePath = useStore((state) => state.fetchProjectFilePath);
  const createProjectFileObjects = useStore(
    (state) => state.createProjectFileObjects
  );
  const fetchSchema = useStore((state) => state.fetchSchema);

  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const data = await fetchProject();
        setProjectData(data);
      } catch (error) {
        console.error("Error fetching project data:", error);
      }
    };

    const initializeStore = async () => {
      await fetchProjectFilePath();
      await fetchSchema();
      await fetchProjectData();
      await fetchNamedChildren();
      await createProjectFileObjects();
    };

    initializeStore();
  }, [
    fetchNamedChildren,
    setProjectData,
    fetchProjectFilePath,
    createProjectFileObjects,
    fetchSchema,
  ]);

  return children;
};
