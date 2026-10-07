import fs from 'fs';
import path from 'path';
import { BUILTIN_THEMES } from './builtinThemes';
import { expandColorway, resolveMode, resolveTheme, resolveTokens, tokensToCssVars } from './resolveTheme';
import PALETTES from './palettes.json';

describe('resolveMode', () => {
  it('uses the project mode when the viewer has no override', () => {
    expect(resolveMode('dark', null, false)).toBe('dark');
    expect(resolveMode('light', undefined, true)).toBe('light');
  });

  it('lets the viewer override win', () => {
    expect(resolveMode('light', 'dark', false)).toBe('dark');
    expect(resolveMode('dark', 'light', true)).toBe('light');
  });

  it('follows the OS for auto, whether set by project or viewer', () => {
    expect(resolveMode('auto', null, true)).toBe('dark');
    expect(resolveMode('auto', null, false)).toBe('light');
    expect(resolveMode('light', 'auto', true)).toBe('dark');
  });

  it('falls back to light for unknown values', () => {
    expect(resolveMode(undefined, null, true)).toBe('light');
    expect(resolveMode('sepia', null, true)).toBe('light');
  });
});

describe('resolveTokens precedence', () => {
  it('returns the built-in tokens with no project theme', () => {
    expect(resolveTokens(null, 'dark')).toEqual(BUILTIN_THEMES.dark);
  });

  it('layers shared tokens over the built-in and per-mode tokens over shared', () => {
    const theme = {
      surface: '#fafafa',
      accent: '#111111',
      dark: { accent: '#222222' },
      light: { text: '#000000' },
    };
    const dark = resolveTokens(theme, 'dark');
    expect(dark.surface).toBe('#fafafa');
    expect(dark.accent).toBe('#222222');
    expect(dark.text).toBe(BUILTIN_THEMES.dark.text);

    const light = resolveTokens(theme, 'light');
    expect(light.accent).toBe('#111111');
    expect(light.text).toBe('#000000');
  });

  it('expands a palette name into its colors and ignores unknown names', () => {
    const name = Object.keys(PALETTES)[0];
    expect(resolveTokens({ colorway: name }, 'light').colorway).toEqual(PALETTES[name]);
    expect(resolveTokens({ colorway: 'Nope' }, 'light').colorway).toEqual(
      BUILTIN_THEMES.light.colorway
    );
  });

  it('accepts an explicit colorway list', () => {
    expect(expandColorway(['#000000', '#ffffff'])).toEqual(['#000000', '#ffffff']);
    expect(expandColorway([])).toBeNull();
  });
});

describe('resolveTheme', () => {
  it('merges plotly_layout passthroughs, mode-specific last', () => {
    const theme = resolveTheme(
      {
        plotly_layout: { hoverlabel: { font: { size: 20 } }, margin: { t: 10 } },
        dark: { plotly_layout: { margin: { t: 30 } } },
      },
      'dark'
    );
    expect(theme.plotlyTemplate.layout.hoverlabel.font.size).toBe(20);
    expect(theme.plotlyTemplate.layout.hoverlabel.font.color).toBe(BUILTIN_THEMES.dark.text);
    expect(theme.plotlyTemplate.layout.margin.t).toBe(30);
  });

  it('returns the same object for the same inputs so memoised consumers stay stable', () => {
    const projectTheme = { accent: '#123456' };
    expect(resolveTheme(projectTheme, 'light')).toBe(resolveTheme({ accent: '#123456' }, 'light'));
  });

  it('exposes css variables for DOM surfaces', () => {
    const { cssVars } = resolveTheme({ surface: '#010203' }, 'light');
    expect(cssVars['--vt-surface']).toBe('#010203');
    expect(cssVars['--vt-font-size']).toBe('12px');
  });
});

describe('dashboardTheme.css fallbacks', () => {
  it('match the built-in light theme', () => {
    const css = fs.readFileSync(path.join(__dirname, 'dashboardTheme.css'), 'utf8');
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const vars = tokensToCssVars(BUILTIN_THEMES.light);
    const skipped = ['--vt-font', '--vt-font-size'];
    for (const [name, value] of Object.entries(vars)) {
      if (skipped.includes(name)) continue;
      expect(rootBlock).toContain(`${name}: ${value};`);
    }
  });
});
