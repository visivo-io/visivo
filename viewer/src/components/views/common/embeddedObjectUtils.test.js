/**
 * Tests for embedded object editing utilities: embedded detection and
 * immutable path-based updates (including 'insights[0]' array notation).
 */
import { isEmbeddedObject, setAtPath } from './embeddedObjectUtils';

describe('isEmbeddedObject', () => {
  it('returns true when the object carries _embedded metadata', () => {
    expect(isEmbeddedObject({ _embedded: { parentName: 'model_a', path: 'source' } })).toBe(true);
    expect(isEmbeddedObject({ _embedded: {} })).toBe(true);
  });

  it('returns false when _embedded is null or missing', () => {
    expect(isEmbeddedObject({ _embedded: null })).toBe(false);
    expect(isEmbeddedObject({ name: 'plain' })).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    expect(isEmbeddedObject(null)).toBe(false);
    expect(isEmbeddedObject(undefined)).toBe(false);
  });
});

describe('setAtPath', () => {
  it('sets a simple key', () => {
    expect(setAtPath({ a: 1 }, 'source', { name: 'pg' })).toEqual({
      a: 1,
      source: { name: 'pg' },
    });
  });

  it('overwrites an existing simple key', () => {
    expect(setAtPath({ source: 'old' }, 'source', 'new')).toEqual({ source: 'new' });
  });

  it('does not mutate the original object', () => {
    const original = { source: 'old', insights: ['i0'] };
    setAtPath(original, 'source', 'new');
    setAtPath(original, 'insights[0]', 'replaced');
    expect(original).toEqual({ source: 'old', insights: ['i0'] });
  });

  it('replaces an array element via bracket notation', () => {
    const obj = { insights: ['a', 'b', 'c'] };
    expect(setAtPath(obj, 'insights[1]', 'B')).toEqual({ insights: ['a', 'B', 'c'] });
  });

  it('creates the array when the key does not exist yet', () => {
    expect(setAtPath({}, 'insights[0]', 'first')).toEqual({ insights: ['first'] });
  });

  it('extends the array when the index is beyond current length', () => {
    const result = setAtPath({ insights: ['a'] }, 'insights[2]', 'c');
    expect(result.insights).toHaveLength(3);
    expect(result.insights[0]).toBe('a');
    expect(result.insights[2]).toBe('c');
  });

  it('does not mutate the original array', () => {
    const obj = { insights: ['a'] };
    const result = setAtPath(obj, 'insights[0]', 'z');
    expect(obj.insights).toEqual(['a']);
    expect(result.insights).toEqual(['z']);
  });

  it('treats non-numeric bracket paths as plain keys', () => {
    const result = setAtPath({}, 'insights[x]', 'v');
    expect(result).toEqual({ 'insights[x]': 'v' });
  });
});
