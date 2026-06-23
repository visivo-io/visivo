/**
 * build-trace-catalogs.js — CommonJS build script (run with `node scripts/build-trace-catalogs.js`)
 *
 * Reads tracePropCatalog.js (ESM), merges each entry with schema metadata from
 * plotly.js/dist/plot-schema.json, and writes one <type>.catalog.json per trace type
 * into src/schemas/.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── 1. Load tracePropCatalog.js via vm sandbox (strips ESM syntax) ──────────

const catalogPath = path.resolve(__dirname, '../src/components/new-views/common/tracePropCatalog.js');
let catalogSrc = fs.readFileSync(catalogPath, 'utf8');

// Strip ES module export declarations so the code runs in CommonJS vm context
catalogSrc = catalogSrc
  // Handle: export const tracePropCatalog = { ... }
  .replace(/export\s+const\s+tracePropCatalog\s*=/, 'const tracePropCatalog =')
  // Handle: export default tracePropCatalog;
  .replace(/^export\s+default\s+\w+\s*;?\s*$/m, '')
  // Handle any remaining named export blocks: export { ... }
  .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');

const sandboxModule = { exports: {} };
const sandboxCtx = vm.createContext({ module: sandboxModule, exports: sandboxModule.exports });

try {
  vm.runInContext(catalogSrc + '\nmodule.exports = tracePropCatalog;', sandboxCtx);
} catch (err) {
  console.error('Failed to parse tracePropCatalog.js:', err.message);
  process.exit(1);
}

const tracePropCatalog = sandboxModule.exports;

if (!tracePropCatalog || typeof tracePropCatalog !== 'object') {
  console.error('tracePropCatalog did not export an object');
  process.exit(1);
}

// ── 2. Load plotly.js schema ──────────────────────────────────────────────────

const schemaPath = path.resolve(__dirname, '../node_modules/plotly.js/dist/plot-schema.json');
let plotSchema;

try {
  plotSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
} catch (err) {
  console.error('Failed to load plot-schema.json:', err.message);
  process.exit(1);
}

const traceSchemas = plotSchema.traces || {};

// ── 3. Helper: navigate a nested schema path ──────────────────────────────────

/**
 * Navigate a dot-separated path into the schema attributes object.
 * Returns the schema node or undefined if not found.
 */
function getSchemaProp(typeSchema, dotPath) {
  const parts = dotPath.split('.');
  let node = typeSchema;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

// ── 4. Build and write catalog JSONs ─────────────────────────────────────────

const outDir = path.resolve(__dirname, '../src/schemas');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

let totalTypes = 0;
let totalEntries = 0;

Object.entries(tracePropCatalog).forEach(([type, entries]) => {
  if (!Array.isArray(entries)) {
    console.warn(`  ⚠ Skipping "${type}" — expected array, got ${typeof entries}`);
    return;
  }

  // Get this trace type's attributes from the plotly schema.
  // Plotly schema stores trace schemas under plotSchema.traces[type].attributes
  const typeAttrs = traceSchemas[type]?.attributes || {};

  const enriched = entries.map(entry => {
    const schemaProp = getSchemaProp(typeAttrs, entry.path);

    return {
      path: entry.path,
      label: entry.label,
      tier: entry.tier,
      description: entry.description,
      keywords: entry.keywords,
      enumValues: entry.enumValues,
      example: entry.example,
      schemaValType: schemaProp?.valType || null,
      schemaEditType: schemaProp?.editType || null,
    };
  });

  const outPath = path.join(outDir, `${type}.catalog.json`);
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2) + '\n');

  totalTypes += 1;
  totalEntries += enriched.length;
  console.log(`  ✓ ${type}.catalog.json (${enriched.length} entries)`);
});

console.log(`\nDone. Wrote ${totalTypes} catalog files, ${totalEntries} total entries.`);
