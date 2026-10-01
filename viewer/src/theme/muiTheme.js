import { createTheme } from '@mui/material';

const cache = new WeakMap();

export const createDashboardMuiTheme = tokens => {
  const hit = cache.get(tokens);
  if (hit) return hit;
  const theme = createTheme({
    palette: {
      mode: tokens.mode,
      primary: { main: tokens.accent },
      secondary: { main: tokens.muted_text },
      info: { main: tokens.muted_text },
      background: { default: tokens.surface, paper: tokens.surface },
      text: { primary: tokens.text, secondary: tokens.muted_text },
      divider: tokens.border,
    },
    typography: { fontFamily: tokens.font_family },
    shape: { borderRadius: 8 },
  });
  cache.set(tokens, theme);
  return theme;
};
