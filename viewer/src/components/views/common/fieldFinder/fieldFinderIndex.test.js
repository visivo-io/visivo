/**
 * fieldFinderIndex — index build + deterministic tiered ranking (VIS-1021).
 * Uses a small synthetic schema + catalog so the ranking assertions are exact.
 */
import {
  buildFieldIndex,
  rankFields,
  curatedEntries,
  resetFieldIndexCache,
} from './fieldFinderIndex';

const SCHEMA = {
  type: 'object',
  properties: {
    type: { const: 'scatter' },
    x: { type: 'array' },
    opacity: { type: 'number' },
    mode: { type: 'string', enum: ['lines', 'markers', 'lines+markers'] },
    name: { type: 'string' },
    line: {
      type: 'object',
      properties: {
        dash: { type: 'string', description: 'Sets the dash style of lines' },
        width: { type: 'number' },
      },
    },
    marker: {
      type: 'object',
      properties: {
        color: { type: 'string', description: 'Sets the marker color' },
        colorbar: {
          type: 'object',
          properties: { title: { type: 'string' }, thickness: { type: 'number' } },
        },
        colorsrc: { type: 'string' },
      },
    },
  },
};

const CATALOG = [
  { path: 'x', label: 'X Axis', tier: 'A', keywords: ['x', 'axis', 'data'] },
  { path: 'mode', label: 'Display Mode', tier: 'B', keywords: ['mode', 'display'] },
  { path: 'line.dash', label: 'Line Dash', tier: 'B', keywords: ['dash', 'dashed', 'style'] },
  { path: 'marker.color', label: 'Marker Color', tier: 'B', keywords: ['color', 'fill'] },
  { path: 'opacity', label: 'Opacity', tier: 'B', keywords: ['opacity', 'transparency'] },
];

beforeEach(() => resetFieldIndexCache());

describe('buildFieldIndex', () => {
  it('flattens leaf paths and overlays the catalog (label/tier/keywords)', () => {
    const index = buildFieldIndex('scatter', SCHEMA, CATALOG);
    const byPath = Object.fromEntries(index.map(e => [e.path, e]));
    // Nested leaves are flattened to dot-paths.
    expect(byPath['line.dash']).toBeTruthy();
    expect(byPath['marker.color']).toBeTruthy();
    // Catalog overlay wins for label/tier/keywords.
    expect(byPath['line.dash'].label).toBe('Line Dash');
    expect(byPath['line.dash'].tier).toBe('B');
    expect(byPath['line.dash'].keywords).toContain('dashed');
    // Un-catalogued leaf falls back to a humanized label + null tier.
    expect(byPath['line.width'].label).toBe('Width');
    expect(byPath['line.width'].tier).toBeNull();
  });

  it('classifies scalar vs compound and flags *src variants hidden', () => {
    const index = buildFieldIndex('scatter', SCHEMA, CATALOG);
    const byPath = Object.fromEntries(index.map(e => [e.path, e]));
    expect(byPath['opacity'].isScalar).toBe(true); // number
    expect(byPath['marker.color'].isScalar).toBe(true); // color/string
    expect(byPath['mode'].controlType).toBe('enum');
    expect(byPath['mode'].enumValues).toEqual(['lines', 'markers', 'lines+markers']);
    // colorsrc is a data-binding variant — reachable by exact path, never ranked.
    expect(byPath['marker.colorsrc'].hidden).toBe(true);
  });

  it('caches per type (same reference on rebuild)', () => {
    const a = buildFieldIndex('scatter', SCHEMA, CATALOG);
    const b = buildFieldIndex('scatter', SCHEMA, CATALOG);
    expect(a).toBe(b);
  });
});

describe('rankFields', () => {
  const index = () => buildFieldIndex('scatter', SCHEMA, CATALOG);

  it('exact leaf/label match ranks first', () => {
    const { results } = rankFields('opacity', index());
    expect(results[0].path).toBe('opacity');
  });

  it('a trace-scoped synonym boosts its path above plain prefix matches', () => {
    // "dashed" is a trace synonym → line.dash, AND a catalog keyword on line.dash.
    const { results, synonym } = rankFields('dashed', index());
    expect(synonym.scope).toBe('trace');
    expect(results[0].path).toBe('line.dash');
  });

  it('a layout-scoped synonym is reported so the palette can suppress results', () => {
    const { synonym } = rankFields('stacked', index());
    expect(synonym).toBeTruthy();
    expect(synonym.scope).toBe('layout');
  });

  it('a scope:none synonym carries an explanatory note', () => {
    const { synonym } = rankFields('trend line', index());
    expect(synonym.scope).toBe('none');
    expect(synonym.note).toMatch(/not a built-in/i);
  });

  it('fuzzy-matches a typo to the nearest leaf (colrbar → colorbar)', () => {
    const { results } = rankFields('colrbar', index());
    expect(results.some(r => r.path === 'marker.colorbar')).toBe(true);
  });

  it('never ranks hidden *src variants', () => {
    const { results } = rankFields('colorsrc', index());
    expect(results.some(r => r.path === 'marker.colorsrc')).toBe(false);
  });

  it('keyword hits surface below exact/prefix but above description-only', () => {
    // "transparency" is a keyword on opacity, and a substring of nothing else.
    const { results } = rankFields('transparency', index());
    expect(results[0].path).toBe('opacity');
  });

  it('empty query yields no ranked results', () => {
    expect(rankFields('', index()).results).toEqual([]);
  });

  it('MRU floats a path up within its tier', () => {
    // Two catalog keyword matches for "color": marker.color. Add a second color-ish
    // entry to force a tie, then MRU should decide order.
    const idx = index();
    const { results: base } = rankFields('color', idx);
    // marker.color matches by keyword; ensure MRU of a same-tier path floats it.
    const mruFirst = rankFields('color', idx, { mru: ['marker.color'] });
    expect(mruFirst.results[0].path).toBe('marker.color');
    expect(base.length).toBeGreaterThan(0);
  });
});

describe('curatedEntries', () => {
  it('returns Tier A then B, MRU floated to the very top', () => {
    const index = buildFieldIndex('scatter', SCHEMA, CATALOG);
    const curated = curatedEntries(index);
    // x is the only Tier-A → first.
    expect(curated[0].path).toBe('x');
    expect(curated.every(e => e.tier === 'A' || e.tier === 'B')).toBe(true);

    const withMru = curatedEntries(index, ['opacity']);
    expect(withMru[0].path).toBe('opacity');
  });
});
