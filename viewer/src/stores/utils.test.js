import { getRelativePath, updateNestedValue } from './utils';

describe('getRelativePath', () => {
  it('returns the target (or empty) when base is missing or not a string', () => {
    expect(getRelativePath(null, 'a/b')).toBe('a/b');
    expect(getRelativePath(undefined, 'a/b')).toBe('a/b');
    expect(getRelativePath(42, 'a/b')).toBe('a/b');
    expect(getRelativePath(null, null)).toBe('');
  });

  it('returns empty when the target is missing or not a string', () => {
    expect(getRelativePath('a/b', null)).toBe('');
    expect(getRelativePath('a/b', 5)).toBe('');
  });

  it('returns ./<filename> when base equals target', () => {
    expect(getRelativePath('models/a.sql', 'models/a.sql')).toBe('./a.sql');
  });

  it('walks up from the base directory to the divergent target segment', () => {
    expect(getRelativePath('a/b', 'a/c')).toBe('./c');
    expect(getRelativePath('a/b/c', 'a/d')).toBe('././d');
  });

  it('ignores a single leading slash on either path', () => {
    expect(getRelativePath('/a/b', '/a/c')).toBe('./c');
  });
});

describe('updateNestedValue', () => {
  it('throws when the path is not a non-empty array', () => {
    expect(() => updateNestedValue({}, 'a', 1)).toThrow('Path must be a non-empty array');
    expect(() => updateNestedValue({}, [], 1)).toThrow('Path must be a non-empty array');
  });

  it('sets a top-level key', () => {
    const obj = {};
    updateNestedValue(obj, ['a'], 1);
    expect(obj).toEqual({ a: 1 });
  });

  it('creates intermediate objects for string keys', () => {
    const obj = {};
    updateNestedValue(obj, ['a', 'b', 'c'], 'v');
    expect(obj).toEqual({ a: { b: { c: 'v' } } });
  });

  it('creates intermediate arrays when the next key is numeric', () => {
    const obj = {};
    updateNestedValue(obj, ['a', 0], 'x');
    expect(Array.isArray(obj.a)).toBe(true);
    expect(obj.a[0]).toBe('x');
  });

  it('overwrites an existing nested value without clobbering siblings', () => {
    const obj = { a: { b: 2, keep: true } };
    updateNestedValue(obj, ['a', 'b'], 9);
    expect(obj).toEqual({ a: { b: 9, keep: true } });
  });
});
