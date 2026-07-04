/**
 * expressionPreflight (VIS-993 layer 2, async half) — SQL parse validation.
 *
 * A metric expression like `AVG(value)}` is schema-valid (it's a string) but
 * unparseable: under runs-on-changes it caches fine and then fails the DAG run.
 * The pre-flight sends expression-bearing fields to the backend sqlglot
 * validator at fire time; parse failures block persistence with the error on
 * the field's path. Fail-open everywhere the check cannot run (dist/cloud,
 * network failure) — the backend and the run remain the net.
 */
import { checkExpressions, clearExpressionCache } from './expressionPreflight';
import { validateExpressions } from '../../../api/expressions';

jest.mock('../../../api/expressions', () => ({
  validateExpressions: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  clearExpressionCache();
  validateExpressions.mockResolvedValue({ results: [{ name: 'expression', valid: true }] });
});

describe('checkExpressions', () => {
  test('a valid metric expression passes', async () => {
    const result = await checkExpressions('metric', { name: 'm', expression: 'AVG(value)' });
    expect(result.valid).toBe(true);
    expect(validateExpressions).toHaveBeenCalledWith(
      [{ name: 'expression', expression: 'AVG(value)' }],
      undefined
    );
  });

  test('a parse failure blocks with the error on the field path', async () => {
    validateExpressions.mockResolvedValue({
      results: [{ name: 'expression', valid: false, error: "Expecting ). Line 1, Col: 25" }],
    });
    const result = await checkExpressions('metric', { name: 'm', expression: 'AVG(value)}' });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        path: 'expression',
        keyword: 'expression',
        message: expect.stringMatching(/Expecting/),
      }),
    ]);
  });

  test('relation conditions validate under the condition path', async () => {
    validateExpressions.mockResolvedValue({
      results: [{ name: 'condition', valid: false, error: 'parse error' }],
    });
    const result = await checkExpressions('relation', {
      name: 'r',
      condition: 'a.id == = b.id',
      join_type: 'inner',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('condition');
  });

  test('types without expression fields skip without a network call', async () => {
    const result = await checkExpressions('markdown', { name: 'md', content: 'hello' });
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
    expect(validateExpressions).not.toHaveBeenCalled();
  });

  test('empty or missing expression fields skip (schema owns required-ness)', async () => {
    const result = await checkExpressions('metric', { name: 'm', expression: '' });
    expect(result.valid).toBe(true);
    expect(validateExpressions).not.toHaveBeenCalled();
  });

  test('identical expressions are served from cache — one POST per distinct value', async () => {
    await checkExpressions('metric', { name: 'm', expression: 'SUM(x)' });
    await checkExpressions('metric', { name: 'm', expression: 'SUM(x)' });
    expect(validateExpressions).toHaveBeenCalledTimes(1);
  });

  test('a network failure fails open', async () => {
    validateExpressions.mockRejectedValue(new Error('boom'));
    const result = await checkExpressions('metric', { name: 'm', expression: 'SUM(x)' });
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
  });

  test('failed results are NOT cached (a transient backend hiccup must not stick)', async () => {
    validateExpressions.mockRejectedValueOnce(new Error('boom'));
    await checkExpressions('metric', { name: 'm', expression: 'SUM(y)' });
    validateExpressions.mockResolvedValue({
      results: [{ name: 'expression', valid: false, error: 'parse error' }],
    });
    const result = await checkExpressions('metric', { name: 'm', expression: 'SUM(y)' });
    expect(result.valid).toBe(false);
  });
});
