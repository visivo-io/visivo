import { fetchProjectBlob } from '../api/project';
import { fetchProjectFilePath } from '../api/projectFilePath';
import { hasCompletedOnboarding } from '../components/onboarding/onboardingState';
import { resetProjectSchemaCache } from '../schemas/projectSchema';
import { clearValidationCache } from '../components/views/workspace/validateAgainstSchema';

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
    const isNew =
      project?.name === 'Quickstart Visivo' && (project?.dashboard_count ?? 0) === 0;
    set({ isNewProject: isNew });
  };

  // VIS-1025: the schema caches (projectSchema's loader caches + the compiled
  // AJV validators layered on top) carry no project identity. Every project
  // write lands here (setProject, fetchProject — and the commitStore
  // project_changed soft refresh routes through fetchProject), so this is the
  // seam that keys them by project: drop BOTH layers when the id CHANGES.
  // A same-id refetch, the first project landing, and id-less local blobs all
  // keep a warm cache intact.
  const invalidateSchemaCachesOnProjectSwitch = nextProject => {
    const prevId = get().project?.id;
    const nextId = nextProject?.id;
    if (prevId != null && nextId != null && prevId !== nextId) {
      resetProjectSchemaCache();
      clearValidationCache();
    }
  };

  return {
    project: null,
    projectFilePath: null,
    isNewProject: undefined,
    isOnboardingRequested: computeIsOnboardingRequested(),
    scrollPositions: {},
    setScrollPosition: (dashName, pos) => {
      set(state => ({
        scrollPositions: { ...state.scrollPositions, [dashName]: pos },
      }));
    },
    setProject: project => {
      invalidateSchemaCachesOnProjectSwitch(project);
      set({ project });
      evaluateIsNewProject();
    },

    setProjectFilePath: projectFilePath => {
      set({ projectFilePath });
    },

    fetchProject: async () => {
      const project = await fetchProjectBlob();
      invalidateSchemaCachesOnProjectSwitch(project);
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
