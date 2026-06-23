/**
 * buildGroupSpec tests (VIS-991)
 *
 * Pure unit tests for the schema → FieldGroup-spec mapper, including the
 * "no field is ever dropped" coverage invariant.
 */
import {
  buildGroupSpec,
  groupForField,
  isFieldPresent,
  GROUP_ORDER,
} from './buildGroupSpec';

// Inline Dimension-like fixture mirroring the project $defs shape (anyOf nullable
// strings + one required `expression`). Kept inline so the test stays pure.
const DIMENSION_SCHEMA = {
  type: 'object',
  required: ['expression'],
  properties: {
    path: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'A unique path' },
    name: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Name' },
    file_path: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'File path' },
    expression: { type: 'string', description: 'SQL expression' },
    data_type: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Data type' },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Description' },
  },
};

// A fixture with deliberately unmappable field names to exercise the Advanced fallback.
const ODD_SCHEMA = {
  type: 'object',
  required: [],
  properties: {
    zxcv_unmapped_thing: { type: 'string' },
    another_mystery_field: { type: 'number' },
    color: { type: 'string' },
    layout: { type: 'object' },
  },
};

describe('groupForField', () => {
  test('maps required-ish identity fields and known names', () => {
    expect(groupForField('name')).toBe('essentials');
    expect(groupForField('expression')).toBe('data');
    expect(groupForField('data_type')).toBe('data');
    expect(groupForField('layout')).toBe('layout');
    expect(groupForField('interactions')).toBe('behavior');
    expect(groupForField('props')).toBe('encoding');
    expect(groupForField('color')).toBe('style');
  });

  test('falls through to advanced for unmapped names', () => {
    expect(groupForField('zxcv_unmapped_thing')).toBe('advanced');
    expect(groupForField('')).toBe('advanced');
    expect(groupForField(undefined)).toBe('advanced');
  });

  test('always returns a known group id', () => {
    ['name', 'expression', 'zxcv', 'layout', 'whatever'].forEach(n => {
      expect(GROUP_ORDER).toContain(groupForField(n));
    });
  });
});

describe('isFieldPresent', () => {
  test('treats null/undefined/empty as absent', () => {
    expect(isFieldPresent({ a: null }, 'a')).toBe(false);
    expect(isFieldPresent({ a: undefined }, 'a')).toBe(false);
    expect(isFieldPresent({ a: '' }, 'a')).toBe(false);
    expect(isFieldPresent({ a: [] }, 'a')).toBe(false);
    expect(isFieldPresent({ a: {} }, 'a')).toBe(false);
    expect(isFieldPresent({}, 'a')).toBe(false);
    expect(isFieldPresent(null, 'a')).toBe(false);
  });

  test('treats meaningful values as present', () => {
    expect(isFieldPresent({ a: 'x' }, 'a')).toBe(true);
    expect(isFieldPresent({ a: 0 }, 'a')).toBe(true);
    expect(isFieldPresent({ a: false }, 'a')).toBe(true);
    expect(isFieldPresent({ a: [1] }, 'a')).toBe(true);
    expect(isFieldPresent({ a: { x: 1 } }, 'a')).toBe(true);
  });
});

describe('buildGroupSpec', () => {
  test('returns ordered groups, only non-empty ones', () => {
    const spec = buildGroupSpec('dimension', DIMENSION_SCHEMA, {});
    const ids = spec.map(g => g.id);
    // Order must be a subsequence of the canonical order.
    const orderIndices = ids.map(id => GROUP_ORDER.indexOf(id));
    const sorted = [...orderIndices].sort((a, b) => a - b);
    expect(orderIndices).toEqual(sorted);
    // No empty groups.
    spec.forEach(g => expect(g.fields.length).toBeGreaterThan(0));
  });

  test('required field lands in Essentials and the group is always-open', () => {
    const spec = buildGroupSpec('dimension', DIMENSION_SCHEMA, {});
    const essentials = spec.find(g => g.id === 'essentials');
    expect(essentials).toBeTruthy();
    expect(essentials.alwaysOpen).toBe(true);
    const expr = essentials.fields.find(f => f.name === 'expression');
    expect(expr).toBeTruthy();
    expect(expr.required).toBe(true);
    expect(expr.expanded).toBe(true);
  });

  test('passes objectType through to every group', () => {
    const spec = buildGroupSpec('dimension', DIMENSION_SCHEMA, {});
    spec.forEach(g => expect(g.objectType).toBe('dimension'));
  });

  test('hides server-managed identity fields (path/file_path/type)', () => {
    const spec = buildGroupSpec('dimension', DIMENSION_SCHEMA, {});
    const allNames = spec.flatMap(g => g.fields.map(f => f.name));
    expect(allNames).not.toContain('path');
    expect(allNames).not.toContain('file_path');
    expect(allNames).not.toContain('type');
  });

  test('present fields are expanded, unset rare fields are collapsed', () => {
    const spec = buildGroupSpec('dimension', DIMENSION_SCHEMA, { data_type: 'VARCHAR' });
    const dataGroup = spec.find(g => g.id === 'data');
    const dataType = dataGroup.fields.find(f => f.name === 'data_type');
    expect(dataType.present).toBe(true);
    expect(dataType.expanded).toBe(true);

    // `description` is unset and optional → present false, expanded false.
    const essentials = spec.find(g => g.id === 'essentials');
    const desc = essentials.fields.find(f => f.name === 'description');
    expect(desc.present).toBe(false);
    expect(desc.expanded).toBe(false);
  });

  test('unmapped fields fall to Advanced', () => {
    const spec = buildGroupSpec('mystery', ODD_SCHEMA, {});
    const advanced = spec.find(g => g.id === 'advanced');
    expect(advanced).toBeTruthy();
    const advNames = advanced.fields.map(f => f.name);
    expect(advNames).toContain('zxcv_unmapped_thing');
    expect(advNames).toContain('another_mystery_field');
  });

  // ---- Coverage invariant: NO field is ever dropped ----
  test('COVERAGE: every non-hidden schema property appears in exactly one group', () => {
    const fixtures = [
      ['dimension', DIMENSION_SCHEMA],
      ['mystery', ODD_SCHEMA],
    ];
    const HIDDEN = new Set(['path', 'file_path', 'type']);
    fixtures.forEach(([type, schema]) => {
      const spec = buildGroupSpec(type, schema, {});
      const placed = spec.flatMap(g => g.fields.map(f => f.name));
      const expected = Object.keys(schema.properties).filter(n => !HIDDEN.has(n));
      // Every expected field placed.
      expected.forEach(name => expect(placed).toContain(name));
      // No field placed twice.
      expect(new Set(placed).size).toBe(placed.length);
      // Counts line up exactly (nothing extra, nothing dropped).
      expect(placed.sort()).toEqual(expected.sort());
    });
  });

  test('handles empty/missing schema gracefully', () => {
    expect(buildGroupSpec('x', null, {})).toEqual([]);
    expect(buildGroupSpec('x', {}, {})).toEqual([]);
    expect(buildGroupSpec('x', { properties: {} }, {})).toEqual([]);
  });
});
