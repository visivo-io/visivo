import { generateUniqueName } from './uniqueName';

describe('generateUniqueName', () => {
  it('returns prefix if not taken', () => {
    expect(generateUniqueName('model', new Set())).toBe('model');
  });

  it('returns prefix if not in array', () => {
    expect(generateUniqueName('model', ['other'])).toBe('model');
  });

  it('returns prefix if not in object keys', () => {
    expect(generateUniqueName('model', { other: {} })).toBe('model');
  });

  it('appends _2 when prefix is taken', () => {
    expect(generateUniqueName('model', new Set(['model']))).toBe('model_2');
  });

  it('appends _3 when _2 is also taken', () => {
    expect(generateUniqueName('model', new Set(['model', 'model_2']))).toBe('model_3');
  });

  it('handles many conflicts', () => {
    const names = new Set(['m', 'm_2', 'm_3', 'm_4', 'm_5']);
    expect(generateUniqueName('m', names)).toBe('m_6');
  });

  it('handles null/undefined existingNames', () => {
    expect(generateUniqueName('model', null)).toBe('model');
    expect(generateUniqueName('model', undefined)).toBe('model');
  });
});
