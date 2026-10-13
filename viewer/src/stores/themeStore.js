import * as themeApi from '../api/theme';

const STORAGE_PREFIX = 'visivo:dashboard-theme:';

export const readStoredModeOverride = projectKey => {
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${projectKey}`);
    return ['light', 'dark', 'auto'].includes(value) ? value : null;
  } catch {
    return null;
  }
};

const writeStoredModeOverride = (projectKey, mode) => {
  try {
    if (mode) window.localStorage.setItem(`${STORAGE_PREFIX}${projectKey}`, mode);
    else window.localStorage.removeItem(`${STORAGE_PREFIX}${projectKey}`);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the override is session-only then.
  }
};

// `theme` is the editable draft-or-published theme once fetched; until then the theme that
// arrived with the project envelope applies.
export const selectProjectTheme = state => state.theme ?? state.project?.config?.theme ?? null;

const createThemeSlice = (set, get) => ({
  theme: null,
  themeModeOverrides: {},

  fetchTheme: async () => {
    try {
      const theme = await themeApi.fetchTheme(get().project?.id);
      set({ theme });
    } catch {
      // Keep whatever theme is already showing; the project envelope still carries one.
    }
  },

  saveTheme: async config => {
    get().beginSaveActivity?.();
    let ok = false;
    try {
      await themeApi.saveTheme(config, get().project?.id);
      ok = true;
      await get().fetchTheme();
      await get().checkCommitStatus?.();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      get().endSaveActivity?.(ok);
    }
  },

  setThemeModeOverride: (projectKey, mode) => {
    writeStoredModeOverride(projectKey, mode);
    set(state => ({ themeModeOverrides: { ...state.themeModeOverrides, [projectKey]: mode } }));
  },
});

export default createThemeSlice;
