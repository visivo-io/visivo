/* eslint-disable no-template-curly-in-string -- the sample lines below are the WRAPPER SPELLINGS under test, deliberately written as source text */
import fs from 'fs';
import path from 'path';

/**
 * The codec only stops M6/M24 from coming back if it stays the ONLY place that
 * builds — or strips — a `?{ }` wrapper. This test walks viewer/src and fails
 * on any new ad-hoc construction, which is what let six sites each decide for
 * themselves whether a value was already wrapped.
 *
 * The first version of this guard matched exactly one spelling, `` `?{${ ``.
 * That is not the spelling most likely to be written: the project's YAML and
 * `InsightInteraction`'s own docstring both publish the SPACED form
 * `?{ ... }`, so `` `?{ ${body} }` `` is what a developer copies — and it went
 * unmatched, along with `'?{' + body + '}'` and every other concatenation. A
 * guard that covers one of at least four forms is a guard that reads green
 * while the thing it guards against is reintroduced.
 *
 * If you need to wrap something, call `encodeQueryString` (or
 * `canonicalizeQueryString` on a save path); to take one apart, call
 * `decodeQueryString` / `parseQueryString`. If you genuinely need a literal,
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

/**
 * The four ways a `?{ }` wrapper actually gets hand-rolled, plus the strip.
 *
 * Each entry is `[name, matches]`. `matches` takes the whole line so a rule can ask
 * for more context than a single regex (the interpolation rule needs to know it
 * is inside a template literal, or every prose example string in
 * `interactionHelp.js` would match).
 */
const AD_HOC_RULES = [
  // `` `?{${body}}` `` and `` `?{ ${body} }` `` and `` `${p}?{${b}}` `` — a
  // wrapper opened around a JS interpolation, anywhere in a template literal.
  ['template-literal wrap', line => line.includes('`') && /\?\{\s*\$\{/.test(line)],
  // `'?{' + body` / `"?{" + body` / `` `?{` + body ``
  ['string-concatenation wrap', line => /(['"`])\?\{\1\s*\+/.test(line)],
  // the closing half: `+ '}'`
  ['string-concatenation close', line => /\+\s*(['"`])\}\1/.test(line)],
  // an ad-hoc `/^\?\{...\}$/` — taking the wrapper apart is the codec's job too.
  ['ad-hoc strip regex', line => /\/\^\\\?\\\{/.test(line)],
];

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

function scan() {
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
      for (const [name, matches] of AD_HOC_RULES) {
        if (matches(line)) offenders.push(`${name} — ${rel}:${i + 1}: ${trimmed}`);
      }
    });
  }
  return offenders;
}

describe('expressionCodec owns the `?{ }` wrapper', () => {
  it('no source file builds or strips a wrapper by hand', () => {
    expect(scan()).toEqual([]);
  });

  it('every allowlisted file still exists (so the list cannot rot silently)', () => {
    for (const rel of ALLOWED) {
      expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
    }
  });

  // The guard is only worth having if it fires. These are the reintroductions
  // it must catch — every one of them slipped past the single-spelling version.
  describe('the rules catch every spelling of a hand-rolled wrapper', () => {
    const fires = line => AD_HOC_RULES.some(([, matches]) => matches(line));

    it.each([
      ['the terse template literal', 'const v = `?{${body}}`;'],
      ['the SPACED template literal the YAML publishes', 'const v = `?{ ${body} }`;'],
      ['a wrapper later in a template literal', 'const v = `${prefix}?{${body}}`;'],
      ['single-quoted concatenation', "const v = '?{' + body + '}';"],
      ['double-quoted concatenation', 'const v = "?{" + body + "}";'],
      ['backtick concatenation', 'const v = `?{` + body + `}`;'],
      ['a concatenation closing on its own line', "  + '}';"],
      ['an ad-hoc strip regex', 'const RE = /^\\?\\{([\\s\\S]*)\\}$/;'],
      ['a terser ad-hoc strip regex', 'const RE = /^\\?\\{(.*)\\}$/;'],
    ])('catches %s', (_label, line) => {
      expect(fires(line)).toBe(true);
    });

    it.each([
      ['a prose example in a single-quoted string', "  yamlExample: '?{ ${ref(orders).month} ASC }',"],
      ['a membership check', "if (value.startsWith('?{')) return null;"],
      ['a call into the codec', 'return encodeQueryString({ body, slice });'],
    ])('does not fire on %s', (_label, line) => {
      expect(fires(line)).toBe(false);
    });
  });
});
