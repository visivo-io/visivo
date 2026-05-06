import { fetchProject } from '../api/project';
import { fetchProjectFilePath } from '../api/projectFilePath';

const ONBOARDING_COMPLETED_KEY = 'visivo_onboarding_completed';

const isOnboardingCompletedInStorage = () => {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage &&
      window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true'
    );
  } catch (e) {
    return false;
  }
};

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
  return isOnboardingRequestedInUrl() && !isOnboardingCompletedInStorage();
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
      const project = await fetchProject();
      set({ project });
      evaluateIsNewProject();
    },

    fetchProjectFilePath: async () => {
      const projectFilePath = await fetchProjectFilePath();
      set({ projectFilePath });
    },

    markOnboardingCompleted: () => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        }
      } catch (e) {
        // best-effort
      }
      try {
        if (typeof window !== 'undefined' && window.history && window.location) {
          const url = new URL(window.location.href);
          if (url.searchParams.has('onboarding')) {
            url.searchParams.delete('onboarding');
            const newSearch = url.searchParams.toString();
            const newUrl =
              url.pathname + (newSearch ? `?${newSearch}` : '') + (url.hash || '');
            window.history.replaceState({}, '', newUrl);
          }
        }
      } catch (e) {
        // best-effort
      }
      set({ isOnboardingRequested: false });
    },
  };
};

export default createCommonSlice;
