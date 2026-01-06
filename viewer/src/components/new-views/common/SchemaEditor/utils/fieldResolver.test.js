import {
  resolveFieldType,
  getFieldComponentName,
  getEnumValues,
  getNumberConstraints,
  getArrayItemSchema,
  getDefaultValue,
} from './fieldResolver';

describe('fieldResolver', () => {
  // Common $defs for testing
  const defs = {
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    colorscale: { type: 'array', items: { type: 'string' } },
    'query-string': { type: 'string', pattern: '^\\?\\{.*\\}$' },
  };

  describe('resolveFieldType', () => {
    it('returns string for type: string', () => {
      expect(resolveFieldType({ type: 'string' }, defs)).toBe('string');
    });

    it('returns number for type: number', () => {
      expect(resolveFieldType({ type: 'number' }, defs)).toBe('number');
    });

    it('returns number for type: integer', () => {
      expect(resolveFieldType({ type: 'integer' }, defs)).toBe('number');
    });

    it('returns boolean for type: boolean', () => {
      expect(resolveFieldType({ type: 'boolean' }, defs)).toBe('boolean');
    });

    it('returns array for type: array', () => {
      expect(resolveFieldType({ type: 'array', items: { type: 'string' } }, defs)).toBe('array');
    });

    it('returns object for type: object', () => {
      expect(resolveFieldType({ type: 'object', properties: {} }, defs)).toBe('object');
    });

    it('returns enum for schema with enum', () => {
      expect(resolveFieldType({ enum: ['a', 'b', 'c'] }, defs)).toBe('enum');
    });

    it('returns enum for schema with const', () => {
      expect(resolveFieldType({ const: 'scatter' }, defs)).toBe('enum');
    });

    it('returns color for $ref to color', () => {
      expect(resolveFieldType({ $ref: '#/$defs/color' }, defs)).toBe('color');
    });

    it('returns colorscale for $ref to colorscale', () => {
      expect(resolveFieldType({ $ref: '#/$defs/colorscale' }, defs)).toBe('colorscale');
    });

    it('returns query-string for $ref to query-string only', () => {
      expect(resolveFieldType({ $ref: '#/$defs/query-string' }, defs)).toBe('query-string');
    });

    it('returns color from oneOf with query-string', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { $ref: '#/$defs/color' }],
      };
      expect(resolveFieldType(schema, defs)).toBe('color');
    });

    it('returns string from oneOf with query-string and string', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
      };
      expect(resolveFieldType(schema, defs)).toBe('string');
    });

    it('returns enum from oneOf with query-string and enum', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { enum: ['lines', 'markers'] }],
      };
      expect(resolveFieldType(schema, defs)).toBe('enum');
    });

    it('handles anyOf like oneOf', () => {
      const schema = {
        anyOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }],
      };
      expect(resolveFieldType(schema, defs)).toBe('number');
    });

    it('handles array of types - prefers string', () => {
      expect(resolveFieldType({ type: ['string', 'number'] }, defs)).toBe('string');
    });

    it('handles array of types - number if no string', () => {
      expect(resolveFieldType({ type: ['number', 'boolean'] }, defs)).toBe('number');
    });

    it('returns unknown for null schema', () => {
      expect(resolveFieldType(null, defs)).toBe('unknown');
    });

    it('returns unknown for undefined schema', () => {
      expect(resolveFieldType(undefined, defs)).toBe('unknown');
    });

    it('returns unknown for empty schema', () => {
      expect(resolveFieldType({}, defs)).toBe('unknown');
    });
  });

  describe('getFieldComponentName', () => {
    it('maps string to StringField', () => {
      expect(getFieldComponentName('string')).toBe('StringField');
    });

    it('maps number to NumberField', () => {
      expect(getFieldComponentName('number')).toBe('NumberField');
    });

    it('maps boolean to BooleanField', () => {
      expect(getFieldComponentName('boolean')).toBe('BooleanField');
    });

    it('maps enum to EnumField', () => {
      expect(getFieldComponentName('enum')).toBe('EnumField');
    });

    it('maps color to ColorField', () => {
      expect(getFieldComponentName('color')).toBe('ColorField');
    });

    it('maps colorscale to ColorscaleField', () => {
      expect(getFieldComponentName('colorscale')).toBe('ColorscaleField');
    });

    it('maps array to ArrayField', () => {
      expect(getFieldComponentName('array')).toBe('ArrayField');
    });

    it('maps object to ObjectField', () => {
      expect(getFieldComponentName('object')).toBe('ObjectField');
    });

    it('maps unknown to StringField fallback', () => {
      expect(getFieldComponentName('unknown')).toBe('StringField');
    });

    it('returns StringField for unrecognized type', () => {
      expect(getFieldComponentName('somethingelse')).toBe('StringField');
    });
  });

  describe('getEnumValues', () => {
    it('returns enum values from schema', () => {
      expect(getEnumValues({ enum: ['a', 'b', 'c'] }, defs)).toEqual(['a', 'b', 'c']);
    });

    it('returns const as single-element array', () => {
      expect(getEnumValues({ const: 'scatter' }, defs)).toEqual(['scatter']);
    });

    it('extracts enum from oneOf with query-string', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { enum: ['lines', 'markers'] }],
      };
      expect(getEnumValues(schema, defs)).toEqual(['lines', 'markers']);
    });

    it('returns empty array for non-enum schema', () => {
      expect(getEnumValues({ type: 'string' }, defs)).toEqual([]);
    });

    it('returns empty array for null schema', () => {
      expect(getEnumValues(null, defs)).toEqual([]);
    });
  });

  describe('getNumberConstraints', () => {
    it('extracts minimum and maximum', () => {
      const schema = { type: 'number', minimum: 0, maximum: 100 };
      const constraints = getNumberConstraints(schema, defs);
      expect(constraints.min).toBe(0);
      expect(constraints.max).toBe(100);
    });

    it('extracts exclusive bounds', () => {
      const schema = { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 };
      const constraints = getNumberConstraints(schema, defs);
      expect(constraints.exclusiveMin).toBe(0);
      expect(constraints.exclusiveMax).toBe(10);
    });

    it('extracts multipleOf as step', () => {
      const schema = { type: 'number', multipleOf: 0.1 };
      const constraints = getNumberConstraints(schema, defs);
      expect(constraints.step).toBe(0.1);
    });

    it('detects integer type', () => {
      const schema = { type: 'integer' };
      const constraints = getNumberConstraints(schema, defs);
      expect(constraints.isInteger).toBe(true);
    });

    it('returns empty object for null schema', () => {
      expect(getNumberConstraints(null, defs)).toEqual({});
    });

    it('extracts constraints from oneOf with query-string', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number', minimum: 1, maximum: 10 }],
      };
      const constraints = getNumberConstraints(schema, defs);
      expect(constraints.min).toBe(1);
      expect(constraints.max).toBe(10);
    });
  });

  describe('getArrayItemSchema', () => {
    it('returns items schema for array', () => {
      const schema = { type: 'array', items: { type: 'string' } };
      expect(getArrayItemSchema(schema, defs)).toEqual({ type: 'string' });
    });

    it('returns null for non-array schema', () => {
      expect(getArrayItemSchema({ type: 'string' }, defs)).toBeNull();
    });

    it('returns null if no items defined', () => {
      expect(getArrayItemSchema({ type: 'array' }, defs)).toBeNull();
    });

    it('returns null for null schema', () => {
      expect(getArrayItemSchema(null, defs)).toBeNull();
    });

    it('extracts items from oneOf with query-string', () => {
      const schema = {
        oneOf: [
          { $ref: '#/$defs/query-string' },
          { type: 'array', items: { type: 'number' } },
        ],
      };
      expect(getArrayItemSchema(schema, defs)).toEqual({ type: 'number' });
    });
  });

  describe('getDefaultValue', () => {
    it('returns direct default value', () => {
      expect(getDefaultValue({ type: 'string', default: 'hello' }, defs)).toBe('hello');
    });

    it('returns default from resolved schema', () => {
      const customDefs = {
        ...defs,
        mode: { type: 'string', default: 'markers' },
      };
      expect(getDefaultValue({ $ref: '#/$defs/mode' }, customDefs)).toBe('markers');
    });

    it('returns undefined when no default', () => {
      expect(getDefaultValue({ type: 'string' }, defs)).toBeUndefined();
    });

    it('returns undefined for null schema', () => {
      expect(getDefaultValue(null, defs)).toBeUndefined();
    });

    it('returns default from oneOf static option', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'boolean', default: true }],
      };
      expect(getDefaultValue(schema, defs)).toBe(true);
    });

    it('prefers direct default over resolved default', () => {
      const schema = { type: 'string', default: 'direct' };
      expect(getDefaultValue(schema, defs)).toBe('direct');
    });
  });
});
