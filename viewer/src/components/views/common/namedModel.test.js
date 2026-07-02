/**
 * Tests for the shared named-model validation used by all edit forms.
 */
import { validateName, NAME_PATTERN } from './namedModel';

describe('validateName', () => {
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
