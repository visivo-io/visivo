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

export const selectProjectTheme = state => state.project?.config?.theme ?? null;

const createThemeSlice = set => ({
  themeModeOverrides: {},

  setThemeModeOverride: (projectKey, mode) => {
    writeStoredModeOverride(projectKey, mode);
    set(state => ({ themeModeOverrides: { ...state.themeModeOverrides, [projectKey]: mode } }));
  },
});

export default createThemeSlice;
