/**
 * buildTraceGroupSpec tests (VIS-1020 §3)
 *
 * Pure unit tests for the trace-prop schema → FieldGroup-spec mapper, including
 * the "no field is ever dropped" coverage invariant exercised against the real
 * scatter sidecars (schema + catalog + groups map).
 */
import {
  buildTraceGroupSpec,
  resolveSchemaAtPath,
  humanizePath,
  isPathPresent,
  TRACE_GROUP_ORDER,
} from './buildTraceGroupSpec';

import scatterSchema from '../../../schemas/scatter.schema.json';
import scatterCatalog from '../../../schemas/scatter.catalog.json';
import scatterGroups from '../../../schemas/scatter.groups.json';

// ─── Inline minimal fixtures (kept pure, no JSON imports) ────────────────────

const TINY_SCHEMA = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { const: 'scatter' },
    x: { oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'array' }], description: 'X' },
    y: { oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'array' }], description: 'Y' },
    mode: { type: 'string', description: 'Mode' },
    marker: {
      type: 'object',
      properties: {
        color: { type: 'string', description: 'Marker color' },
        size: { type: 'number', description: 'Marker size' },
      },
    },
    opacity: { type: 'number', description: 'Opacity' },
    xaxis: { type: 'string', description: 'X axis' },
    visible: { type: 'string', description: 'Visible' },
  },
};

const TINY_CATALOG = [
  { path: 'x', label: 'X Axis', tier: 'A', description: 'Sets the x' },
  { path: 'y', label: 'Y Axis', tier: 'A', description: 'Sets the y' },
  { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Drawing mode' },
  { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Marker color' },
];

const TINY_GROUPS = {
  x: 'encoding',
  y: 'encoding',
  'marker.color': 'style',
  'marker.size': 'style',
  opacity: 'style',
  xaxis: 'layout',
  visible: 'other',
};

describe('humanizePath', () => {
  test('humanizes dotted + underscored paths', () => {
    expect(humanizePath('marker.color')).toBe('Marker Color');
    expect(humanizePath('error_x.array')).toBe('Error X Array');
    expect(humanizePath('opacity')).toBe('Opacity');
    expect(humanizePath('')).toBe('');
    expect(humanizePath(undefined)).toBe('');
  });
});

describe('isPathPresent', () => {
  test('treats null/undefined/empty as absent', () => {
    expect(isPathPresent({ x: null }, 'x')).toBe(false);
    expect(isPathPresent({ x: '' }, 'x')).toBe(false);
    expect(isPathPresent({ x: [] }, 'x')).toBe(false);
    expect(isPathPresent({ marker: {} }, 'marker.color')).toBe(false);
    expect(isPathPresent({}, 'x')).toBe(false);
    expect(isPathPresent(null, 'x')).toBe(false);
  });

  test('resolves nested present values', () => {
    expect(isPathPresent({ marker: { color: 'red' } }, 'marker.color')).toBe(true);
    expect(isPathPresent({ opacity: 0 }, 'opacity')).toBe(true);
    expect(isPathPresent({ visible: false }, 'visible')).toBe(true);
  });
});

describe('resolveSchemaAtPath', () => {
  test('resolves top-level and nested schema nodes', () => {
    const node = resolveSchemaAtPath(scatterSchema, 'x');
    expect(node).toBeTruthy();
    expect(node.description).toMatch(/x coordinates/i);

    const markerColor = resolveSchemaAtPath(scatterSchema, 'marker.color');
    expect(markerColor).toBeTruthy();
    expect(markerColor.description).toMatch(/color/i);
  });

  test('returns {} for unresolvable / synthetic paths so fields still render', () => {
    expect(resolveSchemaAtPath(scatterSchema, 'meta')).toBeTruthy();
    expect(resolveSchemaAtPath(scatterSchema, 'totally.bogus.path')).toEqual({});
    expect(resolveSchemaAtPath(null, 'x')).toEqual({});
    expect(resolveSchemaAtPath(scatterSchema, '')).toEqual({});
  });
});

describe('buildTraceGroupSpec — ordering & emptiness', () => {
  test('emits groups as a subsequence of the canonical order, no empties', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: TINY_SCHEMA,
      catalogEntries: TINY_CATALOG,
      groupsMap: TINY_GROUPS,
      value: {},
    });
    const ids = spec.map(g => g.id);
    const orderIndices = ids.map(id => TRACE_GROUP_ORDER.indexOf(id));
    const sorted = [...orderIndices].sort((a, b) => a - b);
    expect(orderIndices).toEqual(sorted);
    spec.forEach(g => expect(g.fields.length).toBeGreaterThan(0));
  });

  test('passes objectType through to every group', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: TINY_SCHEMA,
      catalogEntries: TINY_CATALOG,
      groupsMap: TINY_GROUPS,
    });
    spec.forEach(g => expect(g.objectType).toBe('scatter'));
  });

  test('returns [] for empty/missing schema gracefully', () => {
    expect(buildTraceGroupSpec({ type: 'x' })).toEqual([]);
    expect(
      buildTraceGroupSpec({ type: 'x', schema: {}, catalogEntries: [], groupsMap: {} })
    ).toEqual([]);
  });
});

describe('buildTraceGroupSpec — Essentials (★★)', () => {
  test('Essentials holds Tier-A catalog paths, defaultOpen + alwaysOpen', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: TINY_SCHEMA,
      catalogEntries: TINY_CATALOG,
      groupsMap: TINY_GROUPS,
    });
    const essentials = spec.find(g => g.id === 'essentials');
    expect(essentials).toBeTruthy();
    expect(essentials.defaultOpen).toBe(true);
    expect(essentials.alwaysOpen).toBe(true);
    expect(essentials.icon).toBe('essentials');
    expect(essentials.glyph).toBe('★★');
    const names = essentials.fields.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining(['x', 'y']));
    // Tier-A only — `mode`/`marker.color` are Tier-B and must NOT be here.
    expect(names).not.toContain('mode');
    expect(names).not.toContain('marker.color');
  });

  test('Essentials carries label + path + resolved schema per field', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: scatterSchema,
      catalogEntries: scatterCatalog,
      groupsMap: scatterGroups,
    });
    const essentials = spec.find(g => g.id === 'essentials');
    const x = essentials.fields.find(f => f.name === 'x');
    expect(x.path).toBe('x');
    expect(x.label).toBe('X Axis');
    expect(x.schema).toBeTruthy();
    expect(x.schema.description).toMatch(/x coordinates/i);
  });
});

describe('buildTraceGroupSpec — Key fields (★)', () => {
  test('title literally includes the type and holds Tier-B paths', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: TINY_SCHEMA,
      catalogEntries: TINY_CATALOG,
      groupsMap: TINY_GROUPS,
    });
    const key = spec.find(g => g.id === 'key');
    expect(key).toBeTruthy();
    expect(key.title).toBe('Key fields (scatter)');
    expect(key.label).toBe('Key fields (scatter)');
    expect(key.glyph).toBe('★');
    const names = key.fields.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining(['mode', 'marker.color']));
    // Tier-A must not leak into Key fields.
    expect(names).not.toContain('x');
    expect(names).not.toContain('y');
  });
});

describe('buildTraceGroupSpec — Encoding / Style minus catalog', () => {
  test('Encoding holds groupsMap encoding MINUS Essentials/Key', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: TINY_SCHEMA,
      catalogEntries: TINY_CATALOG,
      groupsMap: TINY_GROUPS,
    });
    const encoding = spec.find(g => g.id === 'encoding');
    // x & y are groupsMap 'encoding' but already claimed by Essentials, so
    // the Encoding group has no remaining fields and is therefore omitted.
    expect(encoding).toBeUndefined();
  });

  test('Encoding present when groupsMap encoding has unclaimed paths', () => {
    const groups = { ...TINY_GROUPS, customdata: 'encoding' };
    const schema = {
      ...TINY_SCHEMA,
      properties: {
        ...TINY_SCHEMA.properties,
        customdata: { type: 'array', description: 'Custom data' },
      },
    };
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema,
      catalogEntries: TINY_CATALOG,
      groupsMap: groups,
    });
    const encoding = spec.find(g => g.id === 'encoding');
    expect(encoding).toBeTruthy();
    expect(encoding.fields.map(f => f.name)).toContain('customdata');
  });

  test('Style holds groupsMap style MINUS catalog paths', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: TINY_SCHEMA,
      catalogEntries: TINY_CATALOG,
      groupsMap: TINY_GROUPS,
    });
    const style = spec.find(g => g.id === 'style');
    expect(style).toBeTruthy();
    const names = style.fields.map(f => f.name);
    // marker.color is Tier-B catalog → excluded from Style.
    expect(names).not.toContain('marker.color');
    // marker.size & opacity are style and uncatalogued → present.
    expect(names).toEqual(expect.arrayContaining(['marker.size', 'opacity']));
  });
});

describe('buildTraceGroupSpec — Layout / Animation / Other collapsed', () => {
  test('Layout/Animation/Other default collapsed', () => {
    const groups = { ...TINY_GROUPS, frame: 'animation' };
    const schema = {
      ...TINY_SCHEMA,
      properties: { ...TINY_SCHEMA.properties, frame: { type: 'string' } },
    };
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema,
      catalogEntries: TINY_CATALOG,
      groupsMap: groups,
    });
    const collapsedGroups = spec.filter(group =>
      ['layout', 'animation', 'other'].includes(group.id)
    );
    expect(collapsedGroups.length).toBeGreaterThan(0);
    collapsedGroups.forEach(g => expect(g.defaultOpen).toBe(false));
  });

  test('Other catches groupsMap other AND unplaced schema leaves', () => {
    // `extra_leaf` is in the schema but absent from groupsMap & catalog.
    const schema = {
      ...TINY_SCHEMA,
      properties: { ...TINY_SCHEMA.properties, extra_leaf: { type: 'string' } },
    };
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema,
      catalogEntries: TINY_CATALOG,
      groupsMap: TINY_GROUPS,
    });
    const other = spec.find(g => g.id === 'other');
    expect(other).toBeTruthy();
    const names = other.fields.map(f => f.name);
    expect(names).toContain('visible'); // groupsMap 'other'
    expect(names).toContain('extra_leaf'); // unplaced schema leaf
  });
});

// ─── Coverage invariant: NO field is ever dropped (real scatter sidecars) ────
describe('buildTraceGroupSpec — coverage invariant (scatter)', () => {
  test('real scatter has Essentials(x,y), Key fields(scatter)+Tier-B, Encoding, Style', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: scatterSchema,
      catalogEntries: scatterCatalog,
      groupsMap: scatterGroups,
    });

    const essentials = spec.find(g => g.id === 'essentials');
    expect(essentials.fields.map(f => f.name)).toEqual(expect.arrayContaining(['x', 'y']));

    const key = spec.find(g => g.id === 'key');
    expect(key.title).toBe('Key fields (scatter)');
    // Tier-B scatter catalog paths.
    expect(key.fields.map(f => f.name)).toEqual(
      expect.arrayContaining(['mode', 'name', 'opacity', 'line.dash'])
    );

    expect(spec.find(g => g.id === 'style')).toBeTruthy();
    // Encoding has unclaimed encoding paths (e.g. customdata, text) beyond x/y.
    expect(spec.find(g => g.id === 'encoding')).toBeTruthy();
  });

  test('every field universe member lands in exactly one group; nothing dropped', () => {
    const spec = buildTraceGroupSpec({
      type: 'scatter',
      schema: scatterSchema,
      catalogEntries: scatterCatalog,
      groupsMap: scatterGroups,
    });

    const placed = spec.flatMap(g => g.fields.map(f => f.name));

    // No field placed twice.
    expect(new Set(placed).size).toBe(placed.length);

    const placedSet = new Set(placed);

    // (a) Every groupsMap path (except discriminator) is placed.
    Object.keys(scatterGroups)
      .filter(p => p !== 'type')
      .forEach(p => expect(placedSet.has(p)).toBe(true));

    // (b) Every catalog path is placed.
    scatterCatalog.forEach(e => expect(placedSet.has(e.path)).toBe(true));

    // (c) Every flattened schema leaf is placed (no schema property dropped).
    // Re-flatten here independently to assert against the builder's own walk.
    const leaves = flattenLeavesForTest(scatterSchema);
    leaves.forEach(leaf => expect(placedSet.has(leaf)).toBe(true));
  });
});

// Independent leaf-flattener mirroring the builder, used only to assert the
// coverage invariant from the test side (so a regression in the builder's own
// flatten can't silently pass).
function flattenLeavesForTest(schema) {
  const defs = schema.$defs || {};
  const out = [];
  const resolveRef = ref =>
    ref && ref.startsWith('#/$defs/') ? defs[ref.replace('#/$defs/', '')] || null : null;
  const staticSchema = node => {
    if (!node) return null;
    if (node.$ref) {
      if (node.$ref === '#/$defs/query-string') return null;
      return resolveRef(node.$ref) || node;
    }
    const opts = node.oneOf || node.anyOf;
    if (opts) {
      const st = opts.filter(o => o && o.$ref !== '#/$defs/query-string');
      if (!st.length) return null;
      const single = st.find(o => o.type !== 'array' || !o.items);
      if (single) {
        if (single.oneOf || single.anyOf) return staticSchema(single);
        if (single.$ref) return resolveRef(single.$ref) || single;
        return single;
      }
      const arr = st.find(o => o.type === 'array' && o.items);
      if (arr) return arr;
      const f = st[0];
      if (f.oneOf || f.anyOf) return staticSchema(f);
      if (f.$ref) return resolveRef(f.$ref) || f;
      return f;
    }
    return node;
  };
  const walk = (node, prefix) => {
    const props = (node && node.properties) || {};
    Object.entries(props).forEach(([name, ps]) => {
      const path = prefix ? `${prefix}.${name}` : name;
      if (!prefix && name === 'type') return;
      const rs = staticSchema(ps);
      if (rs && rs.type === 'object' && rs.properties && Object.keys(rs.properties).length > 0) {
        walk(rs, path);
      } else {
        out.push(path);
      }
    });
  };
  walk(schema, '');
  return out;
}
