/**
 * plotlyValidator tests (VIS-1020 §4)
 *
 * Exercises validateProps against the REAL committed per-type Plotly schemas
 * (scatter), asserting: valid props pass; nested style props are validated to
 * full depth and reported with their dot-path; out-of-enum/pattern values fail;
 * and additionalProperties violations fail. Mirrors the neighboring
 * projectSchema.test.js style.
 */
import { validateProps, clearValidatorCache } from './plotlyValidator';

beforeEach(() => {
  clearValidatorCache();
});

describe('validateProps - valid props', () => {
  test('valid scatter props pass with no errors', async () => {
    const result = await validateProps('scatter', {
      type: 'scatter',
      mode: 'lines+markers',
      line: { dash: 'solid', width: 2 },
      marker: { color: 'red', line: { width: 1 } },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('props including the type key validate cleanly (type is a schema property)', async () => {
    const result = await validateProps('scatter', { type: 'scatter' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('validateProps - shared-$id collision regression (VIS-1020 review)', () => {
  test('validates MULTIPLE distinct types in one session without clearing the cache', async () => {
    // All committed per-type schemas share an identical top-level $id. With a
    // single shared AJV instance, compiling a second distinct type used to throw
    // "schema ... already exists" — which a swallowing caller reported as VALID.
    // This is the canonical type-switch flow (scatter → bar → scatter), so do
    // NOT clearValidatorCache between calls.
    const a = await validateProps('scatter', { type: 'scatter', mode: 'markers' });
    expect(a.valid).toBe(true);

    // A SECOND distinct type must compile + validate, not throw.
    const b = await validateProps('bar', { type: 'bar', orientation: 'v' });
    expect(b.valid).toBe(true);

    // A third distinct type, and re-validating the first — all live together.
    const c = await validateProps('heatmap', { type: 'heatmap' });
    expect(c.valid).toBe(true);
    const a2 = await validateProps('scatter', { type: 'scatter', mode: 'bogus' });
    expect(a2.valid).toBe(false);
    expect(a2.errors.map(e => e.path)).toContain('mode');
  });
});

describe('validateProps - nested enum / pattern violations', () => {
  test('out-of-enum value for a nested style prop (mode) fails with the dot-path "mode"', async () => {
    const result = await validateProps('scatter', { type: 'scatter', mode: 'bogus' });
    expect(result.valid).toBe(false);
    const paths = result.errors.map(e => e.path);
    expect(paths).toContain('mode');
  });

  test('validates the FULL NESTED dot-path tree (marker.line.width), not just top level', async () => {
    // marker.line.width must be a number; a string is invalid three levels deep.
    const result = await validateProps('scatter', {
      type: 'scatter',
      marker: { line: { width: 'not-a-number' } },
    });
    expect(result.valid).toBe(false);
    const paths = result.errors.map(e => e.path);
    // The error must surface at the full nested dot-path, proving deep traversal.
    expect(paths).toContain('marker.line.width');
  });
});

describe('validateProps - additionalProperties violations', () => {
  test('a bogus top-level key fails', async () => {
    const result = await validateProps('scatter', { type: 'scatter', notARealProp: 123 });
    expect(result.valid).toBe(false);
    // additionalProperties errors report at the container path ('' for root).
    const rootErr = result.errors.find(e => e.path === '');
    expect(rootErr).toBeTruthy();
    expect(rootErr.message).toMatch(/notARealProp/);
  });

  test('a bogus nested key fails at the nested dot-path', async () => {
    const result = await validateProps('scatter', {
      type: 'scatter',
      marker: { notARealMarkerProp: 1 },
    });
    expect(result.valid).toBe(false);
    const markerErr = result.errors.find(e => e.path === 'marker');
    expect(markerErr).toBeTruthy();
    expect(markerErr.message).toMatch(/notARealMarkerProp/);
  });
});

describe('validateProps - unknown chart type', () => {
  test('returns a single root-level "Unknown chart type" error', async () => {
    // schemas.js getSchema() logs console.error when an unknown type fails to
    // load; that is expected here, so silence it (setupTests treats unexpected
    // console.error as a failure).
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await validateProps('definitely-not-a-chart-type', { type: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([{ path: '', message: 'Unknown chart type' }]);
    errorSpy.mockRestore();
  });
});

// T4 (promote-roundtrip #5): "the wells display the literal pattern:
// must match pattern '^\?\{.*\}...' — an unreadable regex, shown twice (x
// and y)" was the audit's exact quote. `x`/`y` are `query-string`-shaped
// (oneOf: [pattern-constrained ?{...} string, static array]); a plain
// non-matching string fails BOTH branches, and AJV's nested `pattern`
// sub-error (raw regex source) is what used to leak through.
describe('validateProps - pattern violations never leak the raw regex (T4)', () => {
  test('a non-matching x value never surfaces `\\?\\{` / `^` / `$` regex syntax in its message', async () => {
    const result = await validateProps('scatter', { type: 'scatter', x: 'not-a-ref-or-array' });
    expect(result.valid).toBe(false);
    const xErrors = result.errors.filter(e => e.path === 'x' || e.path.startsWith('x.'));
    expect(xErrors.length).toBeGreaterThan(0);
    xErrors.forEach(err => {
      expect(err.message).not.toMatch(/\\\?\\\{/);
      expect(err.message).not.toMatch(/\^.*\$/);
      expect(err.message.toLowerCase()).not.toContain('pattern "');
    });
    // The actionable, human copy IS present.
    expect(xErrors.some(e => e.message.includes('?{ref(model).column}'))).toBe(true);
  });
});

describe('error shape', () => {
  test('every error is { path: string, message: string }', async () => {
    const result = await validateProps('scatter', { type: 'scatter', mode: 'bogus' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    result.errors.forEach(err => {
      expect(typeof err.path).toBe('string');
      expect(typeof err.message).toBe('string');
    });
  });
});

describe('caching', () => {
  test('repeated validation of the same type reuses the cached compiled validator', async () => {
    // First call compiles + caches; second call must still behave identically.
    const first = await validateProps('scatter', { type: 'scatter', mode: 'lines' });
    const second = await validateProps('scatter', { type: 'scatter', mode: 'lines' });
    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
  });
});
