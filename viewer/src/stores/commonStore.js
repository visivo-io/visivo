import { fetchProject } from '../api/project';
import { fetchProjectFilePath } from '../api/projectFilePath';

const createCommonSlice = (set, get) => {
  const evaluateIsNewProject = () => {
    const { project } = get();
    const dashboards = project?.project_json?.dashboards ?? [];
    const isNew = project?.project_json?.name === 'Quickstart Visivo' && dashboards.length === 0;
    set({ isNewProject: isNew });
  };

  return {
    project: null,
    projectFilePath: null,
    isNewProject: undefined,
    scrollPositions: {},
    previewDrawerWidth: 500, // Default preview drawer width
    setScrollPosition: (dashName, pos) => {
      set(state => ({
        scrollPositions: { ...state.scrollPositions, [dashName]: pos },
      }));
    },
    setPreviewDrawerWidth: (width) => {
      set({ previewDrawerWidth: width });
    },
    setProject: project => {
      set({ project });
      evaluateIsNewProject();
    },

    setProjectFilePath: projectFilePath => {
      set({ projectFilePath });
    },

    fetchProject: async () => {
      const project = await fetchProject();
      set({ project });
      evaluateIsNewProject();
    },

    fetchProjectFilePath: async () => {
      const projectFilePath = await fetchProjectFilePath();
      set({ projectFilePath });
    },
  };
};

export default createCommonSlice;
