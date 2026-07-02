/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * validateAgainstSchema (VIS-993 layer 1) — $defs-driven config validation.
 *
 * The gate that keeps invalid configs out of the draft cache: under
 * runs-on-changes every persisted data-resource fires a real DAG run, and in
 * cloud a failed run 409-blocks Commit — so nothing schema-invalid may persist.
 * Validates against the bundled visivo_project_schema.json $defs (the same
 * snapshot the schema-form engine renders from), via AJV 2020-12 with per-type
 * compiled-validator caching (the plotlyValidator pattern).
 */
import {
  validateRecordConfig,
  validateRecordConfigSync,
  preloadValidationSchema,
  clearValidationCache,
} from './validateAgainstSchema';

beforeEach(() => {
  clearValidationCache();
});

describe('validateRecordConfig (async, authoritative)', () => {
  test('a valid dimension passes', async () => {
    const result = await validateRecordConfig('dimension', {
      name: 'revenue_bucket',
      expression: "case when amount > 100 then 'big' else 'small' end",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("a dimension missing its required 'expression' fails with a targeted error", async () => {
    const result = await validateRecordConfig('dimension', { name: 'broken' });
    expect(result.valid).toBe(false);
    const required = result.errors.find(e => e.keyword === 'required');
    expect(required).toBeDefined();
    expect(required.message).toMatch(/expression/);
  });

  test('an out-of-enum value fails at the field path', async () => {
    const result = await validateRecordConfig('markdown', {
      name: 'notes',
      content: '# hi',
      align: 'diagonal',
    });
    expect(result.valid).toBe(false);
    const enumErr = result.errors.find(e => e.keyword === 'enum');
    expect(enumErr).toBeDefined();
    expect(enumErr.path).toBe('align');
  });

  test('additionalProperties are rejected (extra="forbid" parity)', async () => {
    const result = await validateRecordConfig('dimension', {
      expression: 'x',
      bogus_key: 1,
    });
    expect(result.valid).toBe(false);
    const extra = result.errors.find(e => e.keyword === 'additionalProperties');
    expect(extra).toBeDefined();
    expect(extra.message).toMatch(/bogus_key/);
  });

  test('a wrong-typed field fails at its path', async () => {
    const result = await validateRecordConfig('item', { width: 'wide' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'width')).toBe(true);
  });

  test('ref-string arms accept ${ref(name)} values', async () => {
    const result = await validateRecordConfig('item', {
      width: 1,
      chart: '${ref(revenue_chart)}',
    });
    expect(result.valid).toBe(true);
  });

  test('unknown object types fail open (valid, flagged skipped)', async () => {
    const result = await validateRecordConfig('not_a_type', { anything: true });
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
  });

  test('a nullish config fails open (nothing to validate yet)', async () => {
    const result = await validateRecordConfig('dimension', undefined);
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
  });
});

describe('validateRecordConfigSync (inline UX fast path)', () => {
  test('returns null before the schema is loaded (defer to fire time)', () => {
    expect(validateRecordConfigSync('dimension', { expression: 'x' })).toBeNull();
  });

  test('after preload it validates synchronously with the same result shape', async () => {
    await preloadValidationSchema();
    const bad = validateRecordConfigSync('markdown', { content: 'hi', align: 'diagonal' });
    expect(bad).not.toBeNull();
    expect(bad.valid).toBe(false);
    expect(bad.errors.some(e => e.keyword === 'enum' && e.path === 'align')).toBe(true);

    const good = validateRecordConfigSync('markdown', { content: 'hi', align: 'center' });
    expect(good.valid).toBe(true);
  });
});
