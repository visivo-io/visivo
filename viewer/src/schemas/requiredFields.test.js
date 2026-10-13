/**
 * Tests for the required-fields configuration used by insight/chart edit forms.
 * Pins the behavioral contract: which fields are mandatory per chart type,
 * how optional fields are treated, and the flattening of nested field configs.
 */
import {
  REQUIRED_FIELDS,
  getRequiredFields,
  isFieldRequired,
  getAllFieldNames,
} from './requiredFields';

describe('getRequiredFields', () => {
  it('returns the x/y field configs for scatter', () => {
    const fields = getRequiredFields('scatter');
    expect(fields.map(f => f.name)).toEqual(['x', 'y']);
    expect(fields.every(f => f.type === 'dataArray')).toBe(true);
  });

  it('returns the same x/y shape for bar, line, and area', () => {
    ['bar', 'line', 'area'].forEach(type => {
      expect(getRequiredFields(type).map(f => f.name)).toEqual(['x', 'y']);
    });
  });

  it('returns an empty array for unknown chart types', () => {
    expect(getRequiredFields('nonexistent')).toEqual([]);
    expect(getRequiredFields(undefined)).toEqual([]);
    expect(getRequiredFields(null)).toEqual([]);
  });

  it('returns all five OHLC fields for financial charts', () => {
    ['candlestick', 'ohlc'].forEach(type => {
      expect(getRequiredFields(type).map(f => f.name)).toEqual([
        'x',
        'open',
        'high',
        'low',
        'close',
      ]);
    });
  });

  it('exposes nested field configs for sankey node/link', () => {
    const fields = getRequiredFields('sankey');
    const node = fields.find(f => f.name === 'node');
    const link = fields.find(f => f.name === 'link');
    expect(node.fields.map(f => f.name)).toEqual(['label']);
    expect(link.fields.map(f => f.name)).toEqual(['source', 'target', 'value']);
  });

  it('exposes flaglist options and default for indicator mode', () => {
    const mode = getRequiredFields('indicator').find(f => f.name === 'mode');
    expect(mode.type).toBe('flaglist');
    expect(mode.options).toEqual(['number', 'delta', 'gauge']);
    expect(mode.default).toBe('number');
  });

  it('marks hierarchical chart values as optional but labels/parents required', () => {
    ['treemap', 'sunburst', 'icicle'].forEach(type => {
      const fields = getRequiredFields(type);
      expect(fields.find(f => f.name === 'labels').optional).toBeUndefined();
      expect(fields.find(f => f.name === 'parents').optional).toBeUndefined();
      expect(fields.find(f => f.name === 'values').optional).toBe(true);
    });
  });
});

describe('isFieldRequired', () => {
  it('returns true for a required field of a chart type', () => {
    expect(isFieldRequired('scatter', 'x')).toBe(true);
    expect(isFieldRequired('pie', 'values')).toBe(true);
    expect(isFieldRequired('heatmap', 'z')).toBe(true);
  });

  it('returns false for optional fields', () => {
    expect(isFieldRequired('pie', 'labels')).toBe(false);
    expect(isFieldRequired('box', 'x')).toBe(false);
    expect(isFieldRequired('heatmap', 'x')).toBe(false);
    expect(isFieldRequired('surface', 'y')).toBe(false);
  });

  it('returns false for fields not in the config', () => {
    expect(isFieldRequired('scatter', 'z')).toBe(false);
    expect(isFieldRequired('scatter', 'marker')).toBe(false);
  });

  it('returns false for unknown chart types', () => {
    expect(isFieldRequired('nonexistent', 'x')).toBe(false);
  });
});

describe('getAllFieldNames', () => {
  it('returns required and optional field names', () => {
    expect(getAllFieldNames('heatmap')).toEqual(['z', 'x', 'y']);
    expect(getAllFieldNames('pie')).toEqual(['values', 'labels']);
  });

  it('returns top-level names for nested configs (sankey)', () => {
    expect(getAllFieldNames('sankey')).toEqual(['node', 'link']);
  });

  it('returns an empty array for unknown chart types', () => {
    expect(getAllFieldNames('nonexistent')).toEqual([]);
  });

  it('returns geo field names for map charts', () => {
    expect(getAllFieldNames('scattergeo')).toEqual(['lat', 'lon']);
    expect(getAllFieldNames('scattermapbox')).toEqual(['lat', 'lon']);
    expect(getAllFieldNames('choropleth')).toEqual(['locations', 'z']);
  });

  it('returns polar field names for polar charts', () => {
    expect(getAllFieldNames('scatterpolar')).toEqual(['r', 'theta']);
    expect(getAllFieldNames('barpolar')).toEqual(['r', 'theta']);
  });
});

describe('REQUIRED_FIELDS integrity', () => {
  it('every field entry has a name, label, type, and description', () => {
    Object.entries(REQUIRED_FIELDS).forEach(([, fields]) => {
      fields.forEach(field => {
        expect(typeof field.name).toBe('string');
        expect(typeof field.label).toBe('string');
        expect(typeof field.type).toBe('string');
        expect(typeof field.description).toBe('string');
      });
    });
  });

  it('dimensions-based charts require only a dimensions array field', () => {
    ['parcats', 'parcoords', 'splom'].forEach(type => {
      const fields = getRequiredFields(type);
      expect(fields).toHaveLength(1);
      expect(fields[0]).toMatchObject({ name: 'dimensions', type: 'array' });
    });
  });
});

// ---------------------------------------------------------------------------
// Generated-artifact coverage (VIS-1464 P2). The file is produced by
// core/scripts/schema/generate_schema.py; these pin that every trace type the
// CLI accepts (PropType) and every type the picker offers (CHART_TYPES) has
// an entry, so a new trace type cannot ship without key fields.
// ---------------------------------------------------------------------------
describe('required-fields artifact coverage', () => {
  const fs = require('fs');
  const path = require('path');
  const { CHART_TYPES } = require('./schemas');

  // visivo/models/props/types.py is the CLI's PropType enum (48 members).
  const typesPy = fs.readFileSync(
    path.resolve(__dirname, '../../../visivo/models/props/types.py'),
    'utf8'
  );
  const propTypes = [...typesPy.matchAll(/^\s+[A-Z0-9_]+\s*=\s*"([a-z0-9]+)"/gm)].map(m => m[1]);

  it('reads the PropType enum (guards against a silent empty match)', () => {
    expect(propTypes.length).toBeGreaterThanOrEqual(48);
    expect(propTypes).toEqual(expect.arrayContaining(['scatter', 'scatterternary', 'image']));
  });

  it('has a non-empty entry for every PropType member', () => {
    const missing = propTypes.filter(type => getRequiredFields(type).length === 0);
    expect(missing).toEqual([]);
  });

  it('has a non-empty entry for every picker chart type', () => {
    const pickerTypes = CHART_TYPES.map(t => t.value).filter(t => t !== 'layout');
    const missing = pickerTypes.filter(type => getRequiredFields(type).length === 0);
    expect(missing).toEqual([]);
  });

  it('covers the trace types the hand-written file lacked', () => {
    expect(getAllFieldNames('scatterternary')).toEqual(['a', 'b', 'c']);
    expect(getAllFieldNames('scattersmith')).toEqual(['real', 'imag']);
    expect(getAllFieldNames('scatterpolargl')).toEqual(['r', 'theta']);
  });
});
