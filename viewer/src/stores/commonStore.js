import { fetchProject } from '../api/project';

const createCommonSlice = (set, get) => ({
  project: null,
  setProject: project => set({ project }),
  fetchProject: async () => {
    const project = await fetchProject();
    set({ project });
  },
  scrollPositions: {},
  setScrollPosition: (dashName, pos) => {
    set(state => ({
      scrollPositions: { ...state.scrollPositions, [dashName]: pos },
    }));
  },
});

export default createCommonSlice;
