import { BUILTIN_THEMES, THEME_TOKEN_KEYS } from './builtinThemes';
import { buildPlotlyTemplate } from './buildPlotlyTemplate';
import { mix } from './colorUtils';
import PALETTES from './palettes.json';

export const THEME_MODE_OPTIONS = ['light', 'dark', 'auto'];

export const resolveMode = (themeMode, override, prefersDark) => {
  const requested = override || themeMode;
  if (requested === 'dark' || requested === 'light') return requested;
  if (requested === 'auto') return prefersDark ? 'dark' : 'light';
  return 'light';
};

const pickTokens = source => {
  if (!source) return {};
  const picked = {};
  for (const key of THEME_TOKEN_KEYS) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      picked[key] = source[key];
    }
  }
  return picked;
};

export const expandColorway = (colorway, palettes = PALETTES) => {
  if (typeof colorway === 'string') return palettes[colorway] || null;
  if (Array.isArray(colorway) && colorway.length) return colorway;
  return null;
};

export const resolveTokens = (projectTheme, mode, palettes = PALETTES) => {
  const builtin = BUILTIN_THEMES[mode] || BUILTIN_THEMES.light;
  const merged = { ...builtin, ...pickTokens(projectTheme), ...pickTokens(projectTheme?.[mode]) };
  merged.colorway = expandColorway(merged.colorway, palettes) || builtin.colorway;
  merged.font_size = Number(merged.font_size) || builtin.font_size;
  merged.mode = builtin.mode;
  return merged;
};

export const tokensToCssVars = tokens => ({
  '--vt-bg': tokens.background,
  '--vt-surface': tokens.surface,
  '--vt-text': tokens.text,
  '--vt-muted': tokens.muted_text,
  '--vt-border': tokens.border,
  '--vt-grid': tokens.grid,
  '--vt-accent': tokens.accent,
  '--vt-font': tokens.font_family,
  '--vt-font-size': `${tokens.font_size}px`,
  '--vt-table-header': mix(tokens.surface, tokens.text, tokens.mode === 'dark' ? 0.08 : 0.05),
  '--vt-table-stripe': mix(tokens.surface, tokens.text, tokens.mode === 'dark' ? 0.035 : 0.022),
  '--vt-table-hover': mix(tokens.surface, tokens.accent, tokens.mode === 'dark' ? 0.18 : 0.08),
  '--vt-input-bg': tokens.mode === 'dark' ? mix(tokens.surface, tokens.text, 0.06) : tokens.surface,
});

const cache = new Map();
const CACHE_LIMIT = 16;

export const resolveTheme = (projectTheme, mode) => {
  const key = JSON.stringify([projectTheme || null, mode]);
  const hit = cache.get(key);
  if (hit) return hit;

  const resolvedMode = mode === 'dark' ? 'dark' : 'light';
  const tokens = resolveTokens(projectTheme, resolvedMode);
  const plotlyTemplate = buildPlotlyTemplate(tokens, [
    projectTheme?.plotly_layout,
    projectTheme?.[resolvedMode]?.plotly_layout,
  ]);
  const theme = { mode: resolvedMode, tokens, plotlyTemplate, cssVars: tokensToCssVars(tokens) };

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, theme);
  return theme;
};
