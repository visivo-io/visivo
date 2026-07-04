import { getSlotShape, menuPolicyFor } from './slotShape';

const QS = { $ref: '#/$defs/query-string' };
const COLOR = { $ref: '#/$defs/color' };

const DEFS = {
  'query-string': { type: 'string' },
  color: { type: 'string', pattern: '#.*' },
};

describe('getSlotShape — branch classification', () => {
  it('returns scalar-only for {oneOf:[query-string, number]}', () => {
    const schema = { oneOf: [QS, { type: 'number' }] };
    expect(getSlotShape(schema, DEFS)).toBe('scalar-only');
  });

  it('returns scalar-only for {oneOf:[query-string, color-ref]}', () => {
    const schema = { oneOf: [QS, COLOR] };
    expect(getSlotShape(schema, DEFS)).toBe('scalar-only');
  });

  it('returns scalar-only for bare {type:"number"}', () => {
    expect(getSlotShape({ type: 'number' }, DEFS)).toBe('scalar-only');
    expect(getSlotShape({ type: 'integer' }, DEFS)).toBe('scalar-only');
    expect(getSlotShape({ type: 'string' }, DEFS)).toBe('scalar-only');
    expect(getSlotShape({ type: 'boolean' }, DEFS)).toBe('scalar-only');
  });

  it('returns array-only for {oneOf:[query-string, {type:"array"}]}', () => {
    const schema = { oneOf: [QS, { type: 'array', items: { type: 'number' } }] };
    expect(getSlotShape(schema, DEFS)).toBe('array-only');
  });

  it('returns mixed when both number and array branches present', () => {
    const schema = {
      oneOf: [QS, { type: 'number' }, { type: 'array', items: { type: 'number' } }],
    };
    expect(getSlotShape(schema, DEFS)).toBe('mixed');
  });

  it('returns mixed for nested oneOf shape produced by the schema generator', () => {
    // The arrayOk handler in core/scripts/schema/generate_schema.py wraps
    // a primitive's oneOf inside an outer oneOf with the array branch.
    const schema = {
      oneOf: [
        { oneOf: [QS, COLOR] },
        { type: 'array', items: { oneOf: [QS, COLOR] } },
      ],
    };
    expect(getSlotShape(schema, DEFS)).toBe('mixed');
  });

  it('returns unknown for empty / non-classifiable schemas', () => {
    expect(getSlotShape(null, DEFS)).toBe('unknown');
    expect(getSlotShape(undefined, DEFS)).toBe('unknown');
    expect(getSlotShape({}, DEFS)).toBe('unknown');
    expect(getSlotShape({ description: 'no type' }, DEFS)).toBe('unknown');
  });

  it('treats enum-only branches as primitive (scalar-only)', () => {
    expect(getSlotShape({ enum: ['a', 'b', 'c'] }, DEFS)).toBe('scalar-only');
  });

  it('treats const-only branches as primitive', () => {
    expect(getSlotShape({ const: 'bar' }, DEFS)).toBe('scalar-only');
  });
});

describe('menuPolicyFor', () => {
  it('scalar-only enables single-index, disables ranges + all', () => {
    const p = menuPolicyFor('scalar-only');
    expect(p.first).toBe(true);
    expect(p.last).toBe(true);
    expect(p.atRow).toBe(true);
    expect(p.range).toBe(false);
    expect(p.all).toBe(false);
    expect(p.defaultSlice).toBe('[0]');
  });

  it('array-only enables ranges + all, disables single-index', () => {
    const p = menuPolicyFor('array-only');
    expect(p.first).toBe(false);
    expect(p.last).toBe(false);
    expect(p.atRow).toBe(false);
    expect(p.range).toBe(true);
    expect(p.all).toBe(true);
    expect(p.defaultSlice).toBeNull();
  });

  it('mixed enables everything', () => {
    const p = menuPolicyFor('mixed');
    expect(p.first).toBe(true);
    expect(p.last).toBe(true);
    expect(p.atRow).toBe(true);
    expect(p.range).toBe(true);
    expect(p.all).toBe(true);
    expect(p.defaultSlice).toBeNull();
  });

  it('unknown enables everything (safe fallback)', () => {
    const p = menuPolicyFor('unknown');
    expect(p.first).toBe(true);
    expect(p.last).toBe(true);
    expect(p.atRow).toBe(true);
    expect(p.range).toBe(true);
    expect(p.all).toBe(true);
    expect(p.defaultSlice).toBeNull();
  });
});

describe('getSlotShape against real vendored trace schemas', () => {
  // These tests exercise the classifier against actual trace schemas
  // shipped under viewer/src/schemas (vendored from
  // visivo-io/core#265). Failures here would mean the regenerated
  // schemas drifted from what the JS classifier expects.

  // Lazy-load the schemas synchronously at test time. Using require()
  // because the schemas are static JSON.
  const indicatorSchema = require('../../../../../schemas/indicator.schema.json');
  const barSchema = require('../../../../../schemas/bar.schema.json');

  it('classifies indicator.value as scalar-only', () => {
    const valueSchema = indicatorSchema.properties.value;
    const defs = indicatorSchema.$defs || {};
    expect(getSlotShape(valueSchema, defs)).toBe('scalar-only');
  });

  it('classifies indicator.delta.reference as scalar-only', () => {
    const refSchema = indicatorSchema.properties.delta.properties.reference;
    const defs = indicatorSchema.$defs || {};
    expect(getSlotShape(refSchema, defs)).toBe('scalar-only');
  });

  it('classifies bar.x as mixed (post-data_array fix)', () => {
    const xSchema = barSchema.properties.x;
    const defs = barSchema.$defs || {};
    expect(getSlotShape(xSchema, defs)).toBe('mixed');
  });

  it('classifies bar.marker.color as mixed (arrayOk)', () => {
    const colorSchema = barSchema.properties.marker.properties.color;
    const defs = barSchema.$defs || {};
    expect(getSlotShape(colorSchema, defs)).toBe('mixed');
  });
});
