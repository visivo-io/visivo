import fs from 'fs';
import path from 'path';

/**
 * The codec only stops M6/M24 from coming back if it stays the ONLY place that
 * builds a `?{ }` wrapper. This test walks viewer/src and fails on any new
 * ad-hoc `` `?{${...}}` `` template literal — the exact construction that let
 * six sites each decide for themselves whether a value was already wrapped.
 *
 * If you need to wrap something, call `encodeQueryString` (or
 * `canonicalizeQueryString` on a save path). If you genuinely need a literal,
 * add it to ALLOWED with the reason.
 */

const SRC = path.resolve(__dirname, '..');

// Files permitted to construct a wrapper literally.
const ALLOWED = new Set([
  // The grammar owner itself.
  'utils/expressionCodec.js',
  // Owned by open PR #646 (canvas click-to-pick). Its single site at the
  // interaction drop zone wraps correctly today; routing it through the codec
  // belongs to whoever lands that PR, and editing it here would guarantee a
  // conflict. Remove this entry once #646 is merged.
  'components/views/workspace/WorkspaceDndContext.jsx',
]);

// `` `?{${ `` — a template literal opening a wrapper around an interpolation.
const AD_HOC_WRAP = /`\?\{\$\{/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
      walk(full, out);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('expressionCodec owns the `?{ }` wrapper', () => {
  it('no source file builds a wrapper with an ad-hoc template literal', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;
      // Tests are allowed to write literal expected values.
      if (/\.test\.(js|jsx)$/.test(rel)) continue;

      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Skip comment lines — the codebase explains the grammar in prose all
        // over the place, and prose is not a wrapper site.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (AD_HOC_WRAP.test(line)) offenders.push(`${rel}:${i + 1}: ${trimmed}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every allowlisted file still exists (so the list cannot rot silently)', () => {
    for (const rel of ALLOWED) {
      expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
    }
  });
});
