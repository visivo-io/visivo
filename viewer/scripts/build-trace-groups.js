/**
 * build-trace-groups.js — CommonJS build script (run with `node scripts/build-trace-groups.js`)
 *
 * For each chart type in CHART_TYPES (src/schemas/schemas.js), this walks the
 * Plotly plot-schema.json (node_modules/plotly.js/dist/plot-schema.json) trace
 * attributes recursively and emits one src/schemas/<type>.groups.json — a flat
 * map of { "<dotPath>": "<group>" } for every LEAF attribute, where <group> is
 * one of: 'encoding' | 'style' | 'layout' | 'animation' | 'other'.
 *
 * The per-type .schema.json sidecars carry no role/valType, so the
 * Encoding/Style/Layout/Animation/Other classification is derived here, at BUILD
 * time, from each attribute's valType/editType/name in plot-schema.json. This
 * file is the ONLY place plot-schema.json is read — it is never imported into the
 * browser bundle.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── 1. Load CHART_TYPES from schemas.js via vm sandbox (strips ESM syntax) ──

const schemasPath = path.resolve(__dirname, '../src/schemas/schemas.js');
let schemasSrc = fs.readFileSync(schemasPath, 'utf8');

// Extract just the `export const CHART_TYPES = [ ... ];` declaration. The rest
// of schemas.js uses dynamic import() and a Proxy that won't run in a bare vm
// context, so we isolate the literal array we actually need.
const chartTypesMatch = schemasSrc.match(/export\s+const\s+CHART_TYPES\s*=\s*(\[[\s\S]*?\n\]);/);
if (!chartTypesMatch) {
  console.error('Could not locate `export const CHART_TYPES = [...]` in schemas.js');
  process.exit(1);
}

const sandboxModule = { exports: {} };
const sandboxCtx = vm.createContext({ module: sandboxModule, exports: sandboxModule.exports });

try {
  vm.runInContext(
    `const CHART_TYPES = ${chartTypesMatch[1]};\nmodule.exports = CHART_TYPES;`,
    sandboxCtx
  );
} catch (err) {
  console.error('Failed to parse CHART_TYPES from schemas.js:', err.message);
  process.exit(1);
}

const CHART_TYPES = sandboxModule.exports;

if (!Array.isArray(CHART_TYPES) || CHART_TYPES.length === 0) {
  console.error('CHART_TYPES did not parse into a non-empty array');
  process.exit(1);
}

// ── 2. Load plotly.js schema ────────────────────────────────────────────────

const schemaPath = path.resolve(__dirname, '../node_modules/plotly.js/dist/plot-schema.json');
let plotSchema;

try {
  plotSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
} catch (err) {
  console.error('Failed to load plot-schema.json:', err.message);
  process.exit(1);
}

const traceSchemas = plotSchema.traces || {};

// ── 3. Type mapping ─────────────────────────────────────────────────────────
//
// Synthetic types that have no standalone Plotly trace node but render via an
// existing Plotly trace. `area` is scatter + fill='tozeroy', so it borrows the
// scatter attribute tree. Synthetic-allowlisted types do NOT warn when absent.
const SYNTHETIC_TO_PLOTLY = { area: 'scatter' };

// Types we expect to classify against a real Plotly node. Anything else absent
// from plot-schema (e.g. heatmapgl / pointcloud, removed in Plotly 3) gets a
// non-fatal warning and an empty groups map.
const SYNTHETIC_ALLOWLIST = new Set(Object.keys(SYNTHETIC_TO_PLOTLY));

// ── 4. Classification ───────────────────────────────────────────────────────

// Keys present on attribute nodes that are metadata, not child attributes.
// We never descend into / classify these.
const META_KEYS = new Set([
  '_deprecated',
  '_isLinkedToArray',
  '_arrayAttrRegexps',
  '_isSubplotObj',
  '_deprecatedAttrs',
  'editType',
  'role',
  'description',
  'valType',
  'dflt',
  'values',
  'min',
  'max',
  'arrayOk',
  'flags',
  'extras',
  'items',
  'impliedEdits',
  'anim',
]);

// Leaf NAME (last path segment) sets / regexes used by the classifier.
const ENCODING_LEAF_NAMES = new Set([
  'x',
  'y',
  'z',
  'r',
  'theta',
  'a',
  'b',
  'c',
  'values',
  'labels',
  'parents',
  'ids',
  'locations',
  'lat',
  'lon',
  'u',
  'v',
  'w',
  'text',
  'hovertext',
  'customdata',
  'base',
  'measure',
  'close',
  'open',
  'high',
  'low',
  'dimensions',
]);

const STYLE_NAME_RE = /color|opacity|width|size|symbol|dash|line|fill|font|pattern|marker|gradient|shape|smoothing/;
const LAYOUT_RE = /axis|domain|orientation|side|position|offsetgroup|alignmentgroup|xaxis|yaxis|cliponaxis|column|row|scaleanchor/;
// `frame` is anchored with a leading word boundary so it matches animation
// frames (`frame`, `frames`) but NOT `spaceframe`/`wireframe`, which are
// structural style props, not animation.
const ANIMATION_RE = /\bframe|transition|redraw|duration|animation/;

/**
 * Classify a single LEAF attribute into one of the five groups.
 *
 * @param {object} node    the leaf schema node (has a valType)
 * @param {string} dotPath the full dotted path of this leaf
 * @param {string} leaf    the final path segment (attribute name)
 * @returns {'encoding'|'style'|'layout'|'animation'|'other'}
 */
function classifyLeaf(node, dotPath, leaf) {
  const valType = node.valType;
  const editType = typeof node.editType === 'string' ? node.editType : '';

  // 1. data_array is always an encoding channel.
  if (valType === 'data_array') return 'encoding';

  // 2. calc-ish edits on a data-ish leaf, OR a canonical encoding leaf name.
  if (
    (editType.includes('calc') && ENCODING_LEAF_NAMES.has(leaf)) ||
    ENCODING_LEAF_NAMES.has(leaf)
  ) {
    return 'encoding';
  }

  // 3. Visual styling: colors, colorscales, or a styling-flavored name.
  if (valType === 'color' || valType === 'colorscale' || STYLE_NAME_RE.test(leaf)) {
    return 'style';
  }

  // 4. Layout / subplot placement.
  if (LAYOUT_RE.test(leaf) || LAYOUT_RE.test(dotPath)) {
    return 'layout';
  }

  // 5. Animation / transition.
  if (ANIMATION_RE.test(leaf) || ANIMATION_RE.test(dotPath)) {
    return 'animation';
  }

  // 6. Everything else.
  return 'other';
}

/**
 * Recursively walk a Plotly `attributes` object, classifying every LEAF
 * attribute into `out` (a flat { dotPath: group } map). Container nodes
 * (role === 'object', or any node that has child attribute keys but no
 * valType) are recursed into but NOT themselves emitted.
 *
 * @param {object} attrs  an attributes object (map of name → node)
 * @param {string} prefix dotted prefix accumulated so far
 * @param {object} out    accumulator map
 */
function walkAttributes(attrs, prefix, out) {
  if (!attrs || typeof attrs !== 'object') return;

  for (const [name, node] of Object.entries(attrs)) {
    if (META_KEYS.has(name)) continue;
    if (!node || typeof node !== 'object') continue;

    const dotPath = prefix ? `${prefix}.${name}` : name;

    if (typeof node.valType === 'string') {
      // Leaf attribute.
      out[dotPath] = classifyLeaf(node, dotPath, name);
      continue;
    }

    // Container node (role === 'object', items wrapper, or a nested attribute
    // group). Recurse into it without emitting the container itself.
    if (node.role === 'object' || node.items || hasChildAttributes(node)) {
      // `items` holds the per-element schema for linked-to-array containers
      // (e.g. parcoords.dimensions.items.dimension). Descend through it.
      if (node.items && typeof node.items === 'object') {
        for (const itemNode of Object.values(node.items)) {
          if (itemNode && typeof itemNode === 'object') {
            walkAttributes(itemNode, dotPath, out);
          }
        }
      }
      walkAttributes(node, dotPath, out);
    }
  }
}

/**
 * True if the node has at least one child key that is itself an attribute
 * (i.e. a non-meta object value). Distinguishes a container node from a
 * primitive/meta-only node.
 */
function hasChildAttributes(node) {
  for (const [name, child] of Object.entries(node)) {
    if (META_KEYS.has(name)) continue;
    if (child && typeof child === 'object') return true;
  }
  return false;
}

// ── 5. Build and write groups JSONs ─────────────────────────────────────────

const outDir = path.resolve(__dirname, '../src/schemas');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

let totalTypes = 0;
let totalLeaves = 0;

CHART_TYPES.forEach(({ value: type }) => {
  if (type === 'layout') return; // layout is a pseudo-type, not a trace.

  const plotlyType = SYNTHETIC_TO_PLOTLY[type] || type;
  const traceSchema = traceSchemas[plotlyType];

  if (!traceSchema && !SYNTHETIC_ALLOWLIST.has(type)) {
    console.warn(
      `  ⚠ "${type}" is absent from the Plotly schema — emitting an empty ` +
        `groups map. If this type was removed (e.g. heatmapgl/pointcloud in ` +
        `Plotly 3), that is expected; otherwise check for a typo.`
    );
  }

  const groups = {};
  if (traceSchema) {
    walkAttributes(traceSchema.attributes || {}, '', groups);
  }

  const outPath = path.join(outDir, `${type}.groups.json`);
  fs.writeFileSync(outPath, JSON.stringify(groups, null, 2) + '\n');

  totalTypes += 1;
  const leafCount = Object.keys(groups).length;
  totalLeaves += leafCount;
  console.log(`  ✓ ${type}.groups.json (${leafCount} leaves)`);
});

console.log(`\nDone. Wrote ${totalTypes} groups files, ${totalLeaves} total leaf classifications.`);
