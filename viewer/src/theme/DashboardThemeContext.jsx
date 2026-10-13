import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import useStore from '../stores/store';
import { readStoredModeOverride, selectProjectTheme } from '../stores/themeStore';
import { resolveMode, resolveTheme } from './resolveTheme';
import './dashboardTheme.css';

const DashboardThemeContext = createContext(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

export const usePrefersDark = () => {
  const getMatch = () => {
    try {
      return !!window.matchMedia?.(DARK_QUERY)?.matches;
    } catch {
      return false;
    }
  };
  const [prefersDark, setPrefersDark] = useState(getMatch);

  useEffect(() => {
    let mql;
    try {
      mql = window.matchMedia?.(DARK_QUERY);
    } catch {
      mql = null;
    }
    if (!mql?.addEventListener) return undefined;
    const onChange = event => setPrefersDark(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return prefersDark;
};

const projectKeyOf = project => project?.id || project?.name || 'default';

export const DashboardThemeRoot = ({ children, className = '', ...rest }) => {
  const projectTheme = useStore(selectProjectTheme);
  const projectKey = useStore(state => projectKeyOf(state.project));
  const sessionOverride = useStore(state => state.themeModeOverrides[projectKey]);
  const setThemeModeOverride = useStore(state => state.setThemeModeOverride);
  const storedOverride = useMemo(() => readStoredModeOverride(projectKey), [projectKey]);
  const prefersDark = usePrefersDark();

  const allowToggle = projectTheme?.allow_viewer_toggle !== false;
  const userOverride = sessionOverride !== undefined ? sessionOverride : storedOverride;
  const override = allowToggle ? userOverride : null;
  const mode = resolveMode(projectTheme?.mode || 'light', override, prefersDark);
  const theme = resolveTheme(projectTheme, mode);

  const value = useMemo(
    () => ({
      theme,
      allowToggle,
      selectedMode: override || projectTheme?.mode || 'light',
      setSelectedMode: next => setThemeModeOverride(projectKey, next),
    }),
    [theme, allowToggle, override, projectTheme?.mode, setThemeModeOverride, projectKey]
  );

  const style = useMemo(() => ({ ...theme.cssVars, colorScheme: theme.mode }), [theme]);

  // The app shell around the dashboard (history strip, page gutters) sits outside this root.
  useEffect(() => {
    const { body } = document;
    body.dataset.dashboardTheme = theme.mode;
    body.style.setProperty('--vt-page-bg', theme.tokens.background);
    body.style.setProperty('--vt-page-text', theme.tokens.muted_text);
    return () => {
      delete body.dataset.dashboardTheme;
      body.style.removeProperty('--vt-page-bg');
      body.style.removeProperty('--vt-page-text');
    };
  }, [theme]);

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        data-theme={theme.mode}
        data-testid="dashboard-theme-root"
        className={`visivo-dashboard-theme ${className}`}
        style={style}
        {...rest}
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
};

export const useDashboardThemeControls = () => useContext(DashboardThemeContext);

// Surfaces rendered outside a dashboard (editor previews) keep the light look of the editor
// chrome around them, but still pick up the project's light-mode customisations.
export const useDashboardTheme = () => {
  const context = useContext(DashboardThemeContext);
  const projectTheme = useStore(selectProjectTheme);
  if (context) return context.theme;
  return resolveTheme(projectTheme, 'light');
};
