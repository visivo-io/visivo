import fs from 'fs';
import path from 'path';
import { CHART_TYPES } from '../../../schemas/schemas';

// The build-time sidecars live alongside the per-type .schema.json files. We read
// them straight off disk (not via import) so this gate validates exactly what
// `node scripts/build-trace-groups.js` wrote, the same way the build script does.
const SCHEMAS_DIR = path.resolve(__dirname, '../../../schemas');

const VALID_GROUPS = new Set(['encoding', 'style', 'layout', 'animation', 'other']);

// `layout` in CHART_TYPES is a pseudo-type (the chart layout schema), not a real
// trace, so the build script skips it — exclude it here too.
const ALL_TYPES = CHART_TYPES.map(t => t.value).filter(type => type !== 'layout');

function loadGroups(type) {
  const file = path.join(SCHEMAS_DIR, `${type}.groups.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

describe('traceGroups coverage', () => {
  test('every CHART_TYPES type has a <type>.groups.json sidecar', () => {
    ALL_TYPES.forEach(type => {
      const file = path.join(SCHEMAS_DIR, `${type}.groups.json`);
      expect(fs.existsSync(file)).toBe(true);
    });
  });

  test('every <type>.groups.json parses to a flat object map', () => {
    ALL_TYPES.forEach(type => {
      const groups = loadGroups(type);
      expect(groups).toBeInstanceOf(Object);
      expect(Array.isArray(groups)).toBe(false);
    });
  });

  test('every group value is one of the 5 valid groups', () => {
    ALL_TYPES.forEach(type => {
      const groups = loadGroups(type);
      Object.entries(groups).forEach(([dotPath, group]) => {
        // Surface the offending path in the failure message.
        expect({ dotPath, group }).toMatchObject({
          group: expect.stringMatching(/^(encoding|style|layout|animation|other)$/),
        });
        expect(VALID_GROUPS.has(group)).toBe(true);
      });
    });
  });

  test('scatter has at least one encoding and one style entry', () => {
    const groups = loadGroups('scatter');
    const values = Object.values(groups);
    expect(values).toContain('encoding');
    expect(values).toContain('style');
  });

  test('scatter classifies the canonical channels correctly', () => {
    // Sanity anchors so a future build regression on the core classifier is
    // caught here, not only in the per-type fan-out above.
    const groups = loadGroups('scatter');
    expect(groups['x']).toBe('encoding');
    expect(groups['y']).toBe('encoding');
    expect(groups['marker.color']).toBe('style');
    expect(groups['xaxis']).toBe('layout');
  });
});

// ── Drift guard (VIS-514 review) ────────────────────────────────────────────
// The committed .groups.json sidecars are build artifacts and the build script
// is wired into nothing (no package.json script, no CI). A plotly.js bump that
// adds/removes/renames leaf attributes would leave them stale. Mirror the
// catalog coverage test: re-derive each sidecar from the LIVE plot-schema using
// the build script's OWN classifier (no duplicated walk logic) and diff. If this
// fails, run `node scripts/build-trace-groups.js` and commit the result.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { groupsForType, SYNTHETIC_TO_PLOTLY } = require('../../../../scripts/build-trace-groups');

describe('traceGroups drift guard — committed sidecars match the live plot-schema', () => {
  ALL_TYPES.forEach(type => {
    const plotlyType = SYNTHETIC_TO_PLOTLY[type] || type;
    const { groups, traceSchema } = groupsForType(type);
    // Removed types (heatmapgl/pointcloud in Plotly 3) have no schema node; the
    // build script emits an empty map for them — still a valid diff target.
    test(`${type}.groups.json is current${traceSchema ? '' : ' (no plot-schema node → empty)'}`, () => {
      expect(loadGroups(type)).toEqual(groups);
    });
  });
});
