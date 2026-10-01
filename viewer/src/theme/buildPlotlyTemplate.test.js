import fs from 'fs';
import path from 'path';
import { BUILTIN_THEMES, THEME_MODES } from './builtinThemes';
import { buildPlotlyTemplate, TEMPLATED_TRACE_TYPES } from './buildPlotlyTemplate';
import { contrastRatio } from './colorUtils';

const SCHEMA_DIR = path.join(__dirname, '../../../visivo/schema');

const NOT_TRACE_SCHEMAS = ['layout', 'trace-properties'];
const REMOVED_IN_PLOTLY_3 = ['area', 'heatmapgl', 'pointcloud'];
const COLORWAY_ONLY = [
  'box',
  'violin',
  'scatter',
  'scattergl',
  'scatter3d',
  'scattergeo',
  'scattermap',
  'scattermapbox',
  'scatterpolar',
  'scatterpolargl',
  'scatterternary',
  'scattersmith',
  'scattercarpet',
  'splom',
  'image',
];

const schemaTraceTypes = () =>
  fs
    .readdirSync(SCHEMA_DIR)
    .filter(file => file.endsWith('.schema.json'))
    .map(file => file.replace('.schema.json', ''))
    .filter(type => !NOT_TRACE_SCHEMAS.includes(type));

describe('buildPlotlyTemplate', () => {
  it.each(THEME_MODES)('styles every subplot type (%s)', mode => {
    const tokens = BUILTIN_THEMES[mode];
    const { layout } = buildPlotlyTemplate(tokens);
    expect(layout.paper_bgcolor).toBe(tokens.surface);
    expect(layout.plot_bgcolor).toBe(tokens.surface);
    expect(layout.colorway).toEqual(tokens.colorway);
    expect(layout.font.color).toBe(tokens.text);
    expect(layout.xaxis.gridcolor).toBe(tokens.grid);
    expect(layout.yaxis.gridcolor).toBe(tokens.grid);
    expect(layout.polar.bgcolor).toBe(tokens.surface);
    expect(layout.ternary.aaxis.gridcolor).toBe(tokens.grid);
    expect(layout.smith.realaxis.gridcolor).toBe(tokens.grid);
    expect(layout.geo.bgcolor).toBe(tokens.surface);
    expect(layout.map.style).toBe(tokens.map_style);
    expect(layout.mapbox.style).toBe(tokens.map_style);
    expect(layout.scene.zaxis.backgroundcolor).toBe(tokens.surface);
    expect(layout.colorscale.sequential).toEqual(tokens.colorscale_sequential);
    expect(layout.colorscale.diverging).toEqual(tokens.colorscale_diverging);
    expect(layout.hoverlabel.bgcolor).toBe(tokens.surface);
  });

  it('gives every schema trace type a template entry or an explicit reason not to', () => {
    const unaccounted = schemaTraceTypes().filter(
      type =>
        !TEMPLATED_TRACE_TYPES.includes(type) &&
        !COLORWAY_ONLY.includes(type) &&
        !REMOVED_IN_PLOTLY_3.includes(type)
    );
    expect(unaccounted).toEqual([]);
  });

  it('wraps trace defaults in single-element arrays as Plotly templates expect', () => {
    const { data } = buildPlotlyTemplate(BUILTIN_THEMES.light);
    Object.values(data).forEach(entry => {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry).toHaveLength(1);
    });
    expect(data.heatmap[0].colorbar.tickfont.color).toBe(BUILTIN_THEMES.light.muted_text);
    expect(data.pie[0].marker.line.color).toBe(BUILTIN_THEMES.light.surface);
  });

  it('lets extra layouts override the base, later ones winning', () => {
    const { layout } = buildPlotlyTemplate(BUILTIN_THEMES.light, [
      { font: { size: 18 } },
      undefined,
      { font: { size: 20 }, xaxis: { showgrid: false } },
    ]);
    expect(layout.font.size).toBe(20);
    expect(layout.font.color).toBe(BUILTIN_THEMES.light.text);
    expect(layout.xaxis.showgrid).toBe(false);
    expect(layout.xaxis.gridcolor).toBe(BUILTIN_THEMES.light.grid);
  });
});

describe.each(THEME_MODES)('built-in %s theme contrast', mode => {
  const t = BUILTIN_THEMES[mode];

  it('keeps body text at WCAG AA on the surface and page background', () => {
    expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.text, t.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps muted text readable', () => {
    expect(contrastRatio(t.muted_text, t.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every series color at 3:1 against the surface', () => {
    t.colorway.forEach(color => {
      expect(contrastRatio(color, t.surface)).toBeGreaterThanOrEqual(3);
    });
  });

  it('keeps the accent visible on the surface', () => {
    expect(contrastRatio(t.accent, t.surface)).toBeGreaterThanOrEqual(3);
  });
});
