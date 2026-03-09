/* eslint-disable no-template-curly-in-string */
import {
  parseRefValue,
  formatRef,
  formatRefExpression,
  parseMultiRefValue,
  formatMultiRefValue,
} from './refString';

describe('parseRefValue', () => {
  it('returns null for falsy input', () => {
    expect(parseRefValue(null)).toBeNull();
    expect(parseRefValue(undefined)).toBeNull();
    expect(parseRefValue('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseRefValue(42)).toBeNull();
    expect(parseRefValue({ name: 'foo' })).toBeNull();
  });

  it('parses new dot syntax ${name}', () => {
    expect(parseRefValue('${my_source}')).toBe('my_source');
    expect(parseRefValue('${orders}')).toBe('orders');
    expect(parseRefValue('${my-model}')).toBe('my-model');
  });

  it('parses legacy bare ref(name)', () => {
    expect(parseRefValue('ref(mySource)')).toBe('mySource');
  });

  it('parses bare ref with whitespace', () => {
    expect(parseRefValue('ref( mySource )')).toBe('mySource');
  });

  it('parses legacy context string ${ref(name)}', () => {
    expect(parseRefValue('${ref(mySource)}')).toBe('mySource');
  });

  it('parses legacy context string with spaces ${ ref( name ) }', () => {
    expect(parseRefValue('${ ref( mySource ) }')).toBe('mySource');
  });

  it('parses context string with inner spaces ${ ref(name) }', () => {
    expect(parseRefValue('${ ref(mySource) }')).toBe('mySource');
  });

  it('returns raw name as-is', () => {
    expect(parseRefValue('my-source')).toBe('my-source');
  });

  it('handles names with hyphens and underscores', () => {
    expect(parseRefValue('ref(my-source_name)')).toBe('my-source_name');
    expect(parseRefValue('${ref(my-source_name)}')).toBe('my-source_name');
  });
});

describe('formatRef', () => {
  it('formats bare name (new dot syntax)', () => {
    expect(formatRef('myModel')).toBe('myModel');
  });

  it('formats name with property (new dot syntax)', () => {
    expect(formatRef('myModel', 'field')).toBe('myModel.field');
  });

  it('trims whitespace', () => {
    expect(formatRef('  myModel  ')).toBe('myModel');
    expect(formatRef('myModel', '  field  ')).toBe('myModel.field');
  });
});

describe('formatRefExpression', () => {
  it('formats context string ref (new dot syntax)', () => {
    expect(formatRefExpression('myModel')).toBe('${myModel}');
  });

  it('formats context string ref with property (new dot syntax)', () => {
    expect(formatRefExpression('myModel', 'field')).toBe('${myModel.field}');
  });

  it('trims whitespace', () => {
    expect(formatRefExpression('  myModel  ', '  field  ')).toBe('${myModel.field}');
  });
});

describe('parseMultiRefValue', () => {
  it('returns empty array for falsy input', () => {
    expect(parseMultiRefValue(null)).toEqual([]);
    expect(parseMultiRefValue(undefined)).toEqual([]);
    expect(parseMultiRefValue('')).toEqual([]);
  });

  it('parses array of legacy ref strings', () => {
    expect(parseMultiRefValue(['ref(a)', 'ref(b)'])).toEqual(['a', 'b']);
  });

  it('parses array of legacy context string refs', () => {
    expect(parseMultiRefValue(['${ref(a)}', '${ ref(b) }'])).toEqual(['a', 'b']);
  });

  it('parses comma-separated string', () => {
    expect(parseMultiRefValue('ref(a), ref(b)')).toEqual(['a', 'b']);
  });

  it('filters out null values', () => {
    expect(parseMultiRefValue([null, 'ref(a)', ''])).toEqual(['a']);
  });

  it('returns empty for non-array non-string', () => {
    expect(parseMultiRefValue(42)).toEqual([]);
  });
});

describe('formatMultiRefValue', () => {
  it('returns null for empty input', () => {
    expect(formatMultiRefValue(null)).toBeNull();
    expect(formatMultiRefValue([])).toBeNull();
  });

  it('formats array of names as dot syntax refs', () => {
    expect(formatMultiRefValue(['a', 'b'])).toEqual(['${a}', '${b}']);
  });
});

describe('roundtrip: parse then format', () => {
  it('roundtrips bare ref format', () => {
    const name = parseRefValue('ref(mySource)');
    expect(formatRef(name)).toBe('mySource');
  });

  it('roundtrips legacy context string format', () => {
    const name = parseRefValue('${ref(mySource)}');
    expect(formatRefExpression(name)).toBe('${mySource}');
  });

  it('roundtrips new dot syntax format', () => {
    const name = parseRefValue('${my_source}');
    expect(formatRefExpression(name)).toBe('${my_source}');
  });

  it('roundtrips context string with spaces', () => {
    const name = parseRefValue('${ ref( mySource ) }');
    expect(formatRefExpression(name)).toBe('${mySource}');
  });
});
