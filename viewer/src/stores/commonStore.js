import { fetchProjectBlob } from '../api/project';
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
      // Onboarding/legacy callers expect the bulk project_json blob (used
      // by `evaluateIsNewProject` and ProjectContainer). The canonical
      // per-resource endpoint returns a slim envelope and won't satisfy
      // those consumers. Switch to `fetchProject` from api/project.js
      // when ProjectContainer + Onboarding are migrated.
      const project = await fetchProjectBlob();
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
