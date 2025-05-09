import { fetchProject } from '../api/project';

const createCommonSlice = (set, get) => ({
  project: null,
  setProject: project => set({ project }),
  fetchProject: async () => {
    const project = await fetchProject();
    set({ project });
  },
});

export default createCommonSlice;
