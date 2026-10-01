export const THEME_MODES = ['light', 'dark'];

export const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif";

// Categorical orders were chosen by enumerating orderings and keeping only those that pass
// the CVD (>= 8 ΔE), normal-vision (>= 15 ΔE), lightness-band and 3:1 contrast gates in both
// modes, with the first three slots also passing all-pairs (scatter / map forms).
const light = {
  mode: 'light',
  font_family: SYSTEM_FONT_STACK,
  font_size: 12,
  background: '#f6f5f1',
  surface: '#ffffff',
  text: '#1d2136',
  muted_text: '#5d5a66',
  border: '#e3e1da',
  grid: '#ecebe5',
  accent: '#713b57',
  increasing: '#3f8a31',
  decreasing: '#c2412d',
  colorway: [
    '#0a9396',
    '#d25946',
    '#5b4bab',
    '#4f9a3f',
    '#4a6db3',
    '#963f6c',
    '#b9800f',
    '#c8608f',
  ],
  colorscale_sequential: [
    [0, '#e7f3f3'],
    [0.25, '#a9d6d6'],
    [0.5, '#5cb0b2'],
    [0.75, '#16878a'],
    [1, '#0b4f52'],
  ],
  colorscale_diverging: [
    [0, '#a63a28'],
    [0.25, '#dc8a78'],
    [0.5, '#f1efea'],
    [0.75, '#6fb8b9'],
    [1, '#0b6a6d'],
  ],
  map_style: 'carto-positron',
};

const dark = {
  mode: 'dark',
  font_family: SYSTEM_FONT_STACK,
  font_size: 12,
  background: '#12152a',
  surface: '#1b1f36',
  text: '#ecebe1',
  muted_text: '#a6a9bd',
  border: '#2e3352',
  grid: '#2a2f4a',
  accent: '#c98aab',
  increasing: '#5ea64a',
  decreasing: '#e2735a',
  colorway: [
    '#1f9fa2',
    '#df6a50',
    '#8174d6',
    '#5ea64a',
    '#5f86d0',
    '#b85c8c',
    '#b88518',
    '#c86f94',
  ],
  colorscale_sequential: [
    [0, '#202842'],
    [0.25, '#1d5560'],
    [0.5, '#1f8a8d'],
    [0.75, '#4fc0bf'],
    [1, '#b5ebe6'],
  ],
  colorscale_diverging: [
    [0, '#e2735a'],
    [0.25, '#9a4f45'],
    [0.5, '#3a3d52'],
    [0.75, '#2a8789'],
    [1, '#62cccb'],
  ],
  map_style: 'carto-darkmatter',
};

export const BUILTIN_THEMES = { light, dark };

export const THEME_TOKEN_KEYS = [
  'font_family',
  'font_size',
  'background',
  'surface',
  'text',
  'muted_text',
  'border',
  'grid',
  'accent',
  'colorway',
];
