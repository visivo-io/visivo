import {
  supportsQueryString,
  resolveRef,
  getStaticSchema,
  flattenSchemaProperties,
  getValueAtPath,
  setValueAtPath,
  cleanEmptyObjects,
  filterProperties,
} from './schemaUtils';

describe('schemaUtils', () => {
  describe('supportsQueryString', () => {
    it('returns true for direct query-string ref', () => {
      expect(supportsQueryString({ $ref: '#/$defs/query-string' })).toBe(true);
    });

    it('returns true for oneOf with query-string', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
      };
      expect(supportsQueryString(schema)).toBe(true);
    });

    it('returns false for schema without query-string', () => {
      expect(supportsQueryString({ type: 'string' })).toBe(false);
      expect(supportsQueryString({ type: 'number' })).toBe(false);
      expect(supportsQueryString({ enum: ['a', 'b'] })).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(supportsQueryString(null)).toBe(false);
      expect(supportsQueryString(undefined)).toBe(false);
    });
  });

  describe('resolveRef', () => {
    const defs = {
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      'query-string': { type: 'string', pattern: '^\\?\\{.*\\}$' },
    };

    it('resolves valid $ref', () => {
      expect(resolveRef('#/$defs/color', defs)).toEqual(defs.color);
    });

    it('returns null for unknown ref', () => {
      expect(resolveRef('#/$defs/unknown', defs)).toBeNull();
    });

    it('returns null for invalid ref format', () => {
      expect(resolveRef('color', defs)).toBeNull();
      expect(resolveRef(null, defs)).toBeNull();
    });
  });

  describe('getStaticSchema', () => {
    const defs = {
      color: { type: 'string', description: 'A color value' },
      'query-string': { type: 'string' },
    };

    it('returns schema for simple type', () => {
      const schema = { type: 'string' };
      expect(getStaticSchema(schema, defs)).toEqual(schema);
    });

    it('resolves $ref to color', () => {
      const schema = { $ref: '#/$defs/color' };
      expect(getStaticSchema(schema, defs)).toEqual(defs.color);
    });

    it('returns non-query-string option from oneOf', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'boolean', default: true }],
      };
      expect(getStaticSchema(schema, defs)).toEqual({ type: 'boolean', default: true });
    });

    it('resolves $ref within oneOf', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { $ref: '#/$defs/color' }],
      };
      expect(getStaticSchema(schema, defs)).toEqual(defs.color);
    });

    it('returns null for query-string only', () => {
      const schema = { $ref: '#/$defs/query-string' };
      expect(getStaticSchema(schema, defs)).toBeNull();
    });

    it('handles nested oneOf - single value OR array pattern', () => {
      // Pattern: oneOf: [{ oneOf: [query-string, enum] }, { type: array }]
      const schema = {
        oneOf: [
          {
            oneOf: [
              { $ref: '#/$defs/query-string' },
              { enum: ['left', 'right', 'auto'], default: 'auto' },
            ],
          },
          {
            type: 'array',
            items: {
              oneOf: [
                { $ref: '#/$defs/query-string' },
                { enum: ['left', 'right', 'auto'], default: 'auto' },
              ],
            },
          },
        ],
      };
      // Should resolve to the enum inside the nested oneOf
      const result = getStaticSchema(schema, defs);
      expect(result).toEqual({ enum: ['left', 'right', 'auto'], default: 'auto' });
    });

    it('handles nested oneOf with string pattern', () => {
      // Pattern like hoverinfo: oneOf with nested enum + pattern string
      const schema = {
        oneOf: [
          {
            oneOf: [
              { $ref: '#/$defs/query-string' },
              {
                oneOf: [
                  { type: 'string', enum: ['all', 'none', 'skip'] },
                  { type: 'string', pattern: '^(x|y|z)+$' },
                ],
                default: 'all',
              },
            ],
          },
          { type: 'array', items: {} },
        ],
      };
      const result = getStaticSchema(schema, defs);
      // Resolves all the way to the first concrete type (string with enum)
      expect(result).toEqual({ type: 'string', enum: ['all', 'none', 'skip'] });
    });

    it('prefers single value over array when both present', () => {
      const schema = {
        oneOf: [
          { type: 'string', enum: ['a', 'b'] },
          { type: 'array', items: { type: 'string' } },
        ],
      };
      const result = getStaticSchema(schema, defs);
      expect(result).toEqual({ type: 'string', enum: ['a', 'b'] });
    });
  });

  describe('flattenSchemaProperties', () => {
    it('flattens simple properties', () => {
      const schema = {
        properties: {
          x: { type: 'array', description: 'X data' },
          y: { type: 'array', description: 'Y data' },
        },
      };

      const result = flattenSchemaProperties(schema);
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('x');
      expect(result[1].path).toBe('y');
    });

    it('flattens nested object properties (only leaf nodes)', () => {
      const schema = {
        properties: {
          marker: {
            type: 'object',
            properties: {
              color: { type: 'string' },
              size: { type: 'number' },
            },
          },
        },
      };

      const result = flattenSchemaProperties(schema);
      // Should only have leaf nodes: marker.color, marker.size (NOT marker itself)
      expect(result.find(p => p.path === 'marker')).toBeUndefined();
      expect(result.find(p => p.path === 'marker.color')).toBeDefined();
      expect(result.find(p => p.path === 'marker.size')).toBeDefined();
      expect(result).toHaveLength(2);
    });

    it('handles deeply nested objects (only leaf nodes)', () => {
      const schema = {
        properties: {
          marker: {
            type: 'object',
            properties: {
              colorbar: {
                type: 'object',
                properties: {
                  title: {
                    type: 'object',
                    properties: {
                      font: {
                        type: 'object',
                        properties: {
                          size: { type: 'number' },
                          color: { type: 'string' },
                        },
                      },
                      text: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = flattenSchemaProperties(schema);
      // Should only have the deepest leaf nodes
      expect(result.find(p => p.path === 'marker')).toBeUndefined();
      expect(result.find(p => p.path === 'marker.colorbar')).toBeUndefined();
      expect(result.find(p => p.path === 'marker.colorbar.title')).toBeUndefined();
      expect(result.find(p => p.path === 'marker.colorbar.title.font')).toBeUndefined();
      expect(result.find(p => p.path === 'marker.colorbar.title.font.size')).toBeDefined();
      expect(result.find(p => p.path === 'marker.colorbar.title.font.color')).toBeDefined();
      expect(result.find(p => p.path === 'marker.colorbar.title.text')).toBeDefined();
      expect(result).toHaveLength(3);
    });

    it('excludes type property at root level', () => {
      const schema = {
        properties: {
          type: { const: 'scatter' },
          x: { type: 'array' },
        },
      };

      const result = flattenSchemaProperties(schema);
      expect(result.find(p => p.path === 'type')).toBeUndefined();
      expect(result.find(p => p.path === 'x')).toBeDefined();
    });

    it('detects query-string support', () => {
      const schema = {
        properties: {
          x: {
            oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'array' }],
          },
          mode: { type: 'string' },
        },
      };

      const result = flattenSchemaProperties(schema);
      expect(result.find(p => p.path === 'x')?.supportsQueryString).toBe(true);
      expect(result.find(p => p.path === 'mode')?.supportsQueryString).toBe(false);
    });
  });

  describe('getValueAtPath', () => {
    const obj = {
      marker: {
        color: '#ff0000',
        line: {
          width: 2,
        },
      },
      x: [1, 2, 3],
    };

    it('gets top-level value', () => {
      expect(getValueAtPath(obj, 'x')).toEqual([1, 2, 3]);
    });

    it('gets nested value', () => {
      expect(getValueAtPath(obj, 'marker.color')).toBe('#ff0000');
      expect(getValueAtPath(obj, 'marker.line.width')).toBe(2);
    });

    it('returns undefined for missing path', () => {
      expect(getValueAtPath(obj, 'missing')).toBeUndefined();
      expect(getValueAtPath(obj, 'marker.missing')).toBeUndefined();
    });

    it('handles null/undefined object', () => {
      expect(getValueAtPath(null, 'x')).toBeUndefined();
      expect(getValueAtPath(undefined, 'x')).toBeUndefined();
    });
  });

  describe('setValueAtPath', () => {
    it('sets top-level value', () => {
      const result = setValueAtPath({}, 'x', [1, 2, 3]);
      expect(result).toEqual({ x: [1, 2, 3] });
    });

    it('sets nested value', () => {
      const result = setValueAtPath({}, 'marker.color', '#ff0000');
      expect(result).toEqual({ marker: { color: '#ff0000' } });
    });

    it('preserves existing values', () => {
      const obj = { marker: { color: '#ff0000' } };
      const result = setValueAtPath(obj, 'marker.size', 10);
      expect(result).toEqual({ marker: { color: '#ff0000', size: 10 } });
    });

    it('removes value when setting undefined', () => {
      const obj = { marker: { color: '#ff0000', size: 10 } };
      const result = setValueAtPath(obj, 'marker.color', undefined);
      expect(result).toEqual({ marker: { size: 10 } });
    });

    it('removes empty parent objects', () => {
      const obj = { marker: { color: '#ff0000' } };
      const result = setValueAtPath(obj, 'marker.color', undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('cleanEmptyObjects', () => {
    it('removes empty nested objects', () => {
      const obj = { a: { b: {} }, c: 'value' };
      expect(cleanEmptyObjects(obj)).toEqual({ c: 'value' });
    });

    it('preserves arrays', () => {
      const obj = { arr: [], nested: { arr: [1, 2] } };
      expect(cleanEmptyObjects(obj)).toEqual({ arr: [], nested: { arr: [1, 2] } });
    });

    it('returns undefined for completely empty', () => {
      expect(cleanEmptyObjects({})).toBeUndefined();
      expect(cleanEmptyObjects({ a: {} })).toBeUndefined();
    });

    it('handles non-objects', () => {
      expect(cleanEmptyObjects('string')).toBe('string');
      expect(cleanEmptyObjects(123)).toBe(123);
      expect(cleanEmptyObjects(null)).toBeNull();
    });
  });

  describe('filterProperties', () => {
    const properties = [
      { path: 'x', description: 'X axis data' },
      { path: 'y', description: 'Y axis data' },
      { path: 'marker.color', description: 'Marker color' },
      { path: 'mode', description: 'Drawing mode for scatter' },
    ];

    it('filters by path', () => {
      const result = filterProperties(properties, 'marker');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('marker.color');
    });

    it('filters by description', () => {
      const result = filterProperties(properties, 'axis');
      expect(result).toHaveLength(2);
    });

    it('is case-insensitive', () => {
      const result = filterProperties(properties, 'MARKER');
      expect(result).toHaveLength(1);
    });

    it('returns all for empty query', () => {
      expect(filterProperties(properties, '')).toHaveLength(4);
      expect(filterProperties(properties, null)).toHaveLength(4);
    });
  });
});
