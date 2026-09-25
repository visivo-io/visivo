import { validateName, nameGrammarFor, NAME_PATTERN, NAME_SQL_PATTERN } from './namedModel';
import { getObjectSchemaSync } from '../../../schemas/projectSchema';

jest.mock('../../../schemas/projectSchema', () => ({
  getObjectSchemaSync: jest.fn(() => null),
}));

beforeEach(() => getObjectSchemaSync.mockReturnValue(null));

describe('validateName — the general grammar', () => {
  it('returns null for valid names', () => {
    expect(validateName('orders')).toBeNull();
    expect(validateName('my_model')).toBeNull();
    expect(validateName('model-2')).toBeNull();
    expect(validateName('9lives')).toBeNull();
    expect(validateName('A')).toBeNull();
  });

  it('requires a non-empty name', () => {
    expect(validateName('')).toBe('Name is required');
  });

  it('rejects whitespace-only names as required', () => {
    expect(validateName('   ')).toBe('Name is required');
  });

  it('rejects names starting with underscore or hyphen', () => {
    expect(validateName('_private')).toMatch(/must start with a letter or number/);
    expect(validateName('-dash')).toMatch(/must start with a letter or number/);
  });

  it('rejects names containing spaces or special characters', () => {
    expect(validateName('my model')).toMatch(/must start with a letter or number/);
    expect(validateName('model.name')).toMatch(/must start with a letter or number/);
    expect(validateName('model!')).toMatch(/must start with a letter or number/);
    expect(validateName('{ref}')).toMatch(/must start with a letter or number/);
  });
});

describe('NAME_PATTERN', () => {
  it('accepts letters, numbers, underscores, and hyphens after the first char', () => {
    expect(NAME_PATTERN.test('a1_b-c')).toBe(true);
  });

  it('rejects leading non-alphanumerics', () => {
    expect(NAME_PATTERN.test('_x')).toBe(false);
    expect(NAME_PATTERN.test(' x')).toBe(false);
  });
});

describe('NAME_SQL_PATTERN', () => {
  it('accepts a leading underscore and rejects a leading digit', () => {
    expect(NAME_SQL_PATTERN.test('_total')).toBe(true);
    expect(NAME_SQL_PATTERN.test('2024_revenue')).toBe(false);
  });

  it('rejects hyphens anywhere', () => {
    expect(NAME_SQL_PATTERN.test('revenue-2')).toBe(false);
    expect(NAME_SQL_PATTERN.test('revenue_2')).toBe(true);
  });
});

describe('two grammars, not one', () => {
  // A single shared pattern was wrong for metric/dimension in BOTH directions.
  test('a leading digit is legal generally and illegal for a metric', () => {
    expect(validateName('2024_revenue')).toBeNull();
    expect(validateName('2024_revenue', 'metric')).toMatch(/SQL identifier/);
  });

  test('a leading underscore is legal for a metric and illegal generally', () => {
    expect(validateName('_total')).toMatch(/start with a letter or number/);
    expect(validateName('_total', 'metric')).toBeNull();
  });

  test('a hyphen is legal generally and illegal for a metric or dimension', () => {
    expect(validateName('revenue-2')).toBeNull();
    expect(validateName('revenue-2', 'metric')).toMatch(/SQL identifier/);
    expect(validateName('revenue-2', 'dimension')).toMatch(/SQL identifier/);
  });

  test('an underscore suffix works for both, which is why generated names use it', () => {
    expect(validateName('revenue_2')).toBeNull();
    expect(validateName('revenue_2', 'metric')).toBeNull();
  });

  test.each(['chart', 'model', 'source', 'dashboard', 'table', 'insight'])(
    '%s keeps the general grammar',
    type => {
      expect(validateName('my-chart-2', type)).toBeNull();
    }
  );

  test('an empty name is reported before any grammar', () => {
    expect(validateName('   ', 'metric')).toBe('Name is required');
  });
});

describe('the grammar comes from the schema when it is published', () => {
  test('a published pattern wins over the built-in default', () => {
    getObjectSchemaSync.mockReturnValue({ properties: { name: { pattern: '^only_this$' } } });

    expect(nameGrammarFor('metric').pattern.source).toBe('^only_this$');
    expect(validateName('only_this', 'metric')).toBeNull();
    expect(validateName('revenue', 'metric')).not.toBeNull();
  });

  test('the SQL message survives the round trip through the schema', () => {
    getObjectSchemaSync.mockReturnValue({
      properties: { name: { pattern: NAME_SQL_PATTERN.source } },
    });

    expect(nameGrammarFor('metric').message).toMatch(/SQL identifier/);
  });

  test('an unloaded schema falls back rather than accepting anything', () => {
    getObjectSchemaSync.mockReturnValue(null);

    expect(nameGrammarFor('metric').pattern).toBe(NAME_SQL_PATTERN);
    expect(nameGrammarFor('chart').pattern).toBe(NAME_PATTERN);
    expect(nameGrammarFor(undefined).pattern).toBe(NAME_PATTERN);
  });
});
