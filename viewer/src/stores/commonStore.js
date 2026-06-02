import { fetchProjectBlob } from '../api/project';
import { fetchProjectFilePath } from '../api/projectFilePath';
import { hasCompletedOnboarding } from '../components/onboarding/onboardingState';

// `visivo init` opens the viewer at `?onboarding=1` to explicitly request
// the onboarding flow. This is needed because the new-project heuristic
// (name === 'Quickstart Visivo') does not match an init-scaffolded project,
// which is named after its directory. Completion is tracked solely through
// onboardingState (localStorage) so there is one source of truth.
const isOnboardingRequestedInUrl = () => {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('onboarding') === '1';
  } catch (e) {
    return false;
  }
};

const computeIsOnboardingRequested = () => {
  return isOnboardingRequestedInUrl() && !hasCompletedOnboarding();
};

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
    isOnboardingRequested: computeIsOnboardingRequested(),
    scrollPositions: {},
    previewDrawerWidth: 500, // Default preview drawer width
    setScrollPosition: (dashName, pos) => {
      set(state => ({
        scrollPositions: { ...state.scrollPositions, [dashName]: pos },
      }));
    },
    setPreviewDrawerWidth: width => {
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
      // by `evaluateIsNewProject` and the project loader). The canonical
      // per-resource endpoint returns a slim envelope and won't satisfy
      // those consumers. Switch to `fetchProject` from api/project.js
      // when the loader + Onboarding are migrated.
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
