import { tracePropCatalog } from './tracePropCatalog';
import { CHART_TYPES } from '../../../schemas/schemas';

// Load the real Plotly schema with require so the gate validates against the
// same JSON the build script reads (node_modules/plotly.js/dist/plot-schema.json).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plotSchema = require('plotly.js/dist/plot-schema.json');
const traceSchemas = plotSchema.traces || {};

const ALL_TYPES = CHART_TYPES.map(t => t.value);

// Synthetic / removed trace types that legitimately have NO node in the Plotly
// schema, so the path-existence assertion (a) is skipped for them:
//   - area:       synthetic (scatter + fill='tozeroy'); no standalone trace.
//   - heatmapgl:  removed in Plotly 3.
//   - pointcloud: removed in Plotly 3.
// They still must satisfy the shape assertions below; only schema lookups skip.
const NO_SCHEMA_ALLOWLIST = new Set(['area', 'heatmapgl', 'pointcloud']);

/**
 * Navigate a dotted path (e.g. 'marker.color', 'line.dash') into a trace type's
 * `attributes` object. Returns the schema node, or `undefined` if the path does
 * not resolve to anything (a nonexistent attribute — the failure case).
 */
function getSchemaNode(typeAttrs, dotPath) {
  let node = typeAttrs;
  for (const part of dotPath.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

describe('tracePropCatalog coverage', () => {
  test('all 51 trace types are present', () => {
    ALL_TYPES.forEach(type => {
      expect(tracePropCatalog).toHaveProperty(type, expect.any(Array));
    });
  });

  test('each type has at least one Tier-A entry', () => {
    ALL_TYPES.forEach(type => {
      const entries = tracePropCatalog[type] || [];
      const tierA = entries.filter(e => e.tier === 'A');
      expect(tierA.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('each type has at least 2 Tier-B entries', () => {
    ALL_TYPES.forEach(type => {
      const entries = tracePropCatalog[type] || [];
      const tierB = entries.filter(e => e.tier === 'B');
      expect(tierB.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('all entries have required fields', () => {
    ALL_TYPES.forEach(type => {
      (tracePropCatalog[type] || []).forEach(entry => {
        expect(entry).toHaveProperty('path');
        expect(entry).toHaveProperty('label');
        expect(entry).toHaveProperty('tier');
        expect(entry).toHaveProperty('description');
        expect(entry).toHaveProperty('keywords');
        expect(entry).toHaveProperty('enumValues');
        expect(entry).toHaveProperty('example');
        expect(['A', 'B']).toContain(entry.tier);
        expect(Array.isArray(entry.keywords)).toBe(true);
      });
    });
  });

  test('no duplicate paths within a type', () => {
    ALL_TYPES.forEach(type => {
      const paths = (tracePropCatalog[type] || []).map(e => e.path);
      const unique = new Set(paths);
      expect(unique.size).toBe(paths.length);
    });
  });

  // ── Real-schema validation (the data-correctness gate) ──────────────────────
  //
  // The shape assertions above let two data bugs slip through historically:
  //   - funnelarea.hole (a copy-paste from pie — funnelarea has no `hole` attr)
  //   - line.dash missing 'dashdot' (the curated enum truncated the real enum)
  // The two assertions below validate every catalog entry against the actual
  // Plotly plot-schema.json so neither class of bug can return.

  describe('(a) every catalog path resolves to a real Plotly schema node', () => {
    ALL_TYPES.forEach(type => {
      // Skip synthetic/removed types that have no Plotly schema node at all.
      if (NO_SCHEMA_ALLOWLIST.has(type)) return;

      const traceSchema = traceSchemas[type];

      test(`${type}: trace type exists in plot-schema`, () => {
        // Any type NOT in the allowlist must be a real Plotly trace type. If
        // this fails, either add the type to NO_SCHEMA_ALLOWLIST (with a reason)
        // or remove it from the catalog.
        expect(traceSchema).toBeDefined();
      });

      // Only assert per-path resolution when the trace type actually has a
      // schema (the test above guards the "type is missing entirely" case).
      if (!traceSchema) return;
      const typeAttrs = traceSchema.attributes || {};

      (tracePropCatalog[type] || []).forEach(entry => {
        test(`${type}.${entry.path} resolves to a defined schema node`, () => {
          const node = getSchemaNode(typeAttrs, entry.path);
          // Container/object nodes (role === 'object', e.g. sankey.node,
          // parcoords.dimensions) have no valType — that's fine, the node still
          // EXISTS. The only failure is a path that resolves to undefined (a
          // nonexistent attribute, e.g. funnelarea.hole).
          expect(node).toBeDefined();
        });
      });
    });
  });

  describe('(b) non-null enumValues set-equal the schema values (when provided)', () => {
    ALL_TYPES.forEach(type => {
      if (NO_SCHEMA_ALLOWLIST.has(type)) return;
      const traceSchema = traceSchemas[type];
      if (!traceSchema) return;
      const typeAttrs = traceSchema.attributes || {};

      (tracePropCatalog[type] || []).forEach(entry => {
        if (entry.enumValues == null) return;
        const node = getSchemaNode(typeAttrs, entry.path);
        const schemaValues = node && Array.isArray(node.values) ? node.values : null;
        // Only assert when the schema actually provides a `values` array — many
        // curated enums (e.g. mode = lines/markers/...) intentionally enumerate
        // a flatten*able* prop the schema models differently, and colorscale
        // names aren't a schema enum at all.
        if (!schemaValues) return;

        test(`${type}.${entry.path} enumValues set-equal schema values`, () => {
          // Order-independent + type-coerced (the schema mixes strings and the
          // boolean `false`, e.g. image.zsmooth = ['fast', false]).
          const curated = new Set(entry.enumValues.map(String));
          const fromSchema = new Set(schemaValues.map(String));
          expect([...curated].sort()).toEqual([...fromSchema].sort());
        });
      });
    });
  });
});
