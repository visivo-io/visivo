/**
 * Tests for pattern-based multi-select utilities (flaglist values like
 * "lines+markers"): parse, serialize, validation, and regex option extraction.
 */
import {
  parsePatternValue,
  serializePatternValue,
  isPatternValue,
  isEnumValue,
  extractPatternOptions,
} from './patternUtils';

describe('parsePatternValue', () => {
  it('splits a combined pattern into options', () => {
    expect(parsePatternValue('lines+markers')).toEqual(['lines', 'markers']);
    expect(parsePatternValue('lines+markers+text')).toEqual(['lines', 'markers', 'text']);
  });

  it('returns a single option unchanged', () => {
    expect(parsePatternValue('lines')).toEqual(['lines']);
  });

  it('trims whitespace and drops empty parts', () => {
    expect(parsePatternValue(' lines + markers ')).toEqual(['lines', 'markers']);
    expect(parsePatternValue('lines++markers')).toEqual(['lines', 'markers']);
  });

  it('returns [] for empty, undefined, and non-string input', () => {
    expect(parsePatternValue('')).toEqual([]);
    expect(parsePatternValue(undefined)).toEqual([]);
    expect(parsePatternValue(null)).toEqual([]);
    expect(parsePatternValue(42)).toEqual([]);
  });
});

describe('serializePatternValue', () => {
  it('joins options with + sorted alphabetically', () => {
    expect(serializePatternValue(['markers', 'lines'])).toBe('lines+markers');
    expect(serializePatternValue(['text', 'lines', 'markers'])).toBe('lines+markers+text');
  });

  it('returns a single option as-is', () => {
    expect(serializePatternValue(['lines'])).toBe('lines');
  });

  it('returns empty string for empty or non-array input', () => {
    expect(serializePatternValue([])).toBe('');
    expect(serializePatternValue(null)).toBe('');
    expect(serializePatternValue('lines')).toBe('');
  });

  it('filters out falsy and non-string entries', () => {
    expect(serializePatternValue(['lines', null, undefined, 3, 'markers'])).toBe('lines+markers');
  });
});

describe('isPatternValue', () => {
  const allowed = ['lines', 'markers', 'text'];

  it('accepts valid single and combined values', () => {
    expect(isPatternValue('lines', allowed)).toBe(true);
    expect(isPatternValue('lines+markers', allowed)).toBe(true);
    expect(isPatternValue('lines+markers+text', allowed)).toBe(true);
  });

  it('rejects values with parts not in the allowed set', () => {
    expect(isPatternValue('invalid', allowed)).toBe(false);
    expect(isPatternValue('lines+bogus', allowed)).toBe(false);
  });

  it('rejects falsy or non-string values', () => {
    expect(isPatternValue('', allowed)).toBe(false);
    expect(isPatternValue(undefined, allowed)).toBe(false);
    expect(isPatternValue(7, allowed)).toBe(false);
  });

  it('rejects when allowedOptions is empty or not an array', () => {
    expect(isPatternValue('lines', [])).toBe(false);
    expect(isPatternValue('lines', null)).toBe(false);
    expect(isPatternValue('lines', 'lines')).toBe(false);
  });

  it('treats a value that parses to nothing as valid (nothing selected)', () => {
    // '+' splits to no parts — parses empty, which is a valid empty selection
    expect(isPatternValue('+', allowed)).toBe(true);
  });
});

describe('isEnumValue', () => {
  it('returns true when value is in the enum set', () => {
    expect(isEnumValue('none', ['none', 'skip'])).toBe(true);
  });

  it('returns false when value is not in the enum set', () => {
    expect(isEnumValue('lines', ['none', 'skip'])).toBe(false);
  });

  it('returns false for falsy or non-string values', () => {
    expect(isEnumValue('', ['none'])).toBe(false);
    expect(isEnumValue(undefined, ['none'])).toBe(false);
    expect(isEnumValue(0, ['none'])).toBe(false);
  });

  it('returns false when enumOptions is empty or not an array', () => {
    expect(isEnumValue('none', [])).toBe(false);
    expect(isEnumValue('none', null)).toBe(false);
    expect(isEnumValue('none', 'none')).toBe(false);
  });
});

describe('extractPatternOptions', () => {
  it('extracts options from a flaglist regex pattern', () => {
    expect(extractPatternOptions('^(lines|markers|text)(\\+(lines|markers|text))*$')).toEqual([
      'lines',
      'markers',
      'text',
    ]);
  });

  it('works without a leading caret', () => {
    expect(extractPatternOptions('(x|y|z)+')).toEqual(['x', 'y', 'z']);
  });

  it('trims whitespace and drops empty alternatives', () => {
    expect(extractPatternOptions('^( a | b ||c)$')).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for falsy or non-string patterns', () => {
    expect(extractPatternOptions('')).toEqual([]);
    expect(extractPatternOptions(undefined)).toEqual([]);
    expect(extractPatternOptions(null)).toEqual([]);
    expect(extractPatternOptions(123)).toEqual([]);
  });

  it('returns [] when the pattern has no leading group', () => {
    expect(extractPatternOptions('^[a-z]+$')).toEqual([]);
    expect(extractPatternOptions('lines|markers')).toEqual([]);
  });
});
