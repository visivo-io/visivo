// This file tests the regex / parser that processes user-authored query
// strings of the form `?{${ref(model).field}}[N]`. Those literals are
// the data under test, not template-literal mistakes, so disable the
// `no-template-curly-in-string` rule for the whole file.
/* eslint-disable no-template-curly-in-string */

import {
  QueryString,
  isQueryStringValue,
  parseQueryString,
  serializeQueryString,
  isScalarSlice,
  describeSlice,
  QUERY_BRACKET_PATTERN,
  SLICE_PATTERN,
} from './queryString';

describe('QueryString', () => {
  describe('constructor', () => {
    it('should create instance with provided value', () => {
      const value = '?{test}';
      const queryString = new QueryString(value);
      expect(queryString.value).toBe(value);
    });
  });

  describe('toString()', () => {
    it('should return the original value', () => {
      const value = '?{test}';
      const queryString = new QueryString(value);
      expect(queryString.toString()).toBe(value);
    });
  });

  describe('getValue()', () => {
    it('should extract value from valid query string', () => {
      const queryString = new QueryString('?{test}');
      expect(queryString.getValue()).toBe('test');
    });

    it('should extract value with whitespace', () => {
      const queryString = new QueryString('?{  test value  }');
      expect(queryString.getValue()).toBe('test value');
    });

    it('should handle multiple spaces', () => {
      const queryString = new QueryString('?{  multiple   spaces  }');
      expect(queryString.getValue()).toBe('multiple   spaces');
    });

    it('should return null for invalid query string', () => {
      const queryString = new QueryString('invalid');
      expect(queryString.getValue()).toBeNull();
    });

    it('should return null for empty query string', () => {
      const queryString = new QueryString('?{}');
      expect(queryString.getValue()).toBeNull();
    });

    it('should return null for query string with only whitespace', () => {
      const queryString = new QueryString('?{   }');
      expect(queryString.getValue()).toBe('');
    });
  });

  describe('isQueryString()', () => {
    it('should return true for valid query string instances', () => {
      const queryString = new QueryString('?{test}');
      expect(QueryString.isQueryString(queryString)).toBe(true);
    });

    it('should return true for valid query string strings', () => {
      expect(QueryString.isQueryString('?{test}')).toBe(true);
      expect(QueryString.isQueryString('?{  test  }')).toBe(true);
    });

    it('should return false for non-string, non-QueryString objects', () => {
      expect(QueryString.isQueryString(null)).toBe(false);
      expect(QueryString.isQueryString(undefined)).toBe(false);
      expect(QueryString.isQueryString(123)).toBe(false);
      expect(QueryString.isQueryString({})).toBe(false);
      expect(QueryString.isQueryString([])).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(QueryString.isQueryString('')).toBe(false);
    });
  });
});

describe('isQueryStringValue', () => {
  it('detects ?{...} pattern', () => {
    expect(isQueryStringValue('?{column_name}')).toBe(true);
    expect(isQueryStringValue('?{SELECT * FROM table}')).toBe(true);
  });

  it('detects query(...) pattern', () => {
    expect(isQueryStringValue('query(date)')).toBe(true);
    expect(isQueryStringValue('query(SELECT value FROM table)')).toBe(true);
  });

  it('detects column(...) pattern', () => {
    expect(isQueryStringValue('column(date)')).toBe(true);
    expect(isQueryStringValue('column(value)[0]')).toBe(true);
    expect(isQueryStringValue('column(value)[-1]')).toBe(true);
  });

  it('returns false for non-query values', () => {
    expect(isQueryStringValue('hello')).toBe(false);
    expect(isQueryStringValue('#ff0000')).toBe(false);
    expect(isQueryStringValue(123)).toBe(false);
    expect(isQueryStringValue(null)).toBe(false);
    expect(isQueryStringValue(undefined)).toBe(false);
  });

  it('detects ?{...}[N|a:b] slice forms', () => {
    expect(isQueryStringValue('?{x}[0]')).toBe(true);
    expect(isQueryStringValue('?{x}[-1]')).toBe(true);
    expect(isQueryStringValue('?{x}[1:5]')).toBe(true);
    expect(isQueryStringValue('?{x}[::2]')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// New slice-aware grammar (pairs with PR #390 server-side runtime).
// ---------------------------------------------------------------------------

describe('QUERY_BRACKET_PATTERN', () => {
  it.each([
    ['?{column}', { body: 'column', slice: undefined }],
    ['?{ MAX(amount) }', { body: 'MAX(amount)', slice: undefined }],
    ['?{column}[0]', { body: 'column', slice: '[0]' }],
    ['?{column}[-1]', { body: 'column', slice: '[-1]' }],
    ['?{column}[1:5]', { body: 'column', slice: '[1:5]' }],
    ['?{column}[:5]', { body: 'column', slice: '[:5]' }],
    ['?{column}[5:]', { body: 'column', slice: '[5:]' }],
    ['?{column}[-3:-1]', { body: 'column', slice: '[-3:-1]' }],
    ['?{column}[::2]', { body: 'column', slice: '[::2]' }],
    ['?{column}[1:10:2]', { body: 'column', slice: '[1:10:2]' }],
    ['?{column}[0,-1]', { body: 'column', slice: '[0,-1]' }],
    [
      '?{${ref(daily_metrics).value}}[0]',
      { body: '${ref(daily_metrics).value}', slice: '[0]' },
    ],
  ])('matches %s', (value, expected) => {
    const m = value.match(QUERY_BRACKET_PATTERN);
    expect(m).not.toBeNull();
    expect(m.groups.body).toBe(expected.body);
    expect(m.groups.slice).toBe(expected.slice);
  });

  it.each(['plain string', '?{', '}{', '?{x}[abc]', '?{x}[]', '?{x}[0,]'])(
    'rejects %s',
    value => {
      expect(QUERY_BRACKET_PATTERN.test(value)).toBe(false);
    }
  );
});

describe('SLICE_PATTERN', () => {
  it.each(['[0]', '[-1]', '[42]', '[1:5]', '[:5]', '[1:]', '[::2]', '[0,-1]'])(
    'accepts %s',
    s => expect(SLICE_PATTERN.test(s)).toBe(true)
  );

  it.each(['', '0', '[abc]', '[]', '[0,]', '[a:b]'])(
    'rejects %s',
    s => expect(SLICE_PATTERN.test(s)).toBe(false)
  );
});

describe('parseQueryString', () => {
  it('returns null for non-strings', () => {
    expect(parseQueryString(null)).toBeNull();
    expect(parseQueryString(undefined)).toBeNull();
    expect(parseQueryString(42)).toBeNull();
    expect(parseQueryString({})).toBeNull();
  });

  it('returns null for non-?{} strings', () => {
    expect(parseQueryString('plain text')).toBeNull();
    expect(parseQueryString('column(x)')).toBeNull();
  });

  it('extracts body without slice', () => {
    expect(parseQueryString('?{x}')).toEqual({ body: 'x', slice: null });
    expect(parseQueryString('?{ MAX(amount) }')).toEqual({ body: 'MAX(amount)', slice: null });
  });

  it('extracts body and slice for indexed forms', () => {
    expect(parseQueryString('?{x}[0]')).toEqual({ body: 'x', slice: '[0]' });
    expect(parseQueryString('?{x}[-1]')).toEqual({ body: 'x', slice: '[-1]' });
  });

  it('extracts body and slice for slice forms', () => {
    expect(parseQueryString('?{x}[1:5]')).toEqual({ body: 'x', slice: '[1:5]' });
    expect(parseQueryString('?{x}[::2]')).toEqual({ body: 'x', slice: '[::2]' });
  });

  it('keeps the slice OUTSIDE for ref-shaped bodies', () => {
    expect(parseQueryString('?{${ref(daily_metrics).value}}[0]')).toEqual({
      body: '${ref(daily_metrics).value}',
      slice: '[0]',
    });
  });
});

describe('serializeQueryString', () => {
  it('returns empty string when body is missing', () => {
    expect(serializeQueryString({})).toBe('');
    expect(serializeQueryString({ body: '' })).toBe('');
    expect(serializeQueryString({ body: '', slice: '[0]' })).toBe('');
  });

  it('wraps body without slice', () => {
    expect(serializeQueryString({ body: 'x' })).toBe('?{x}');
    expect(serializeQueryString({ body: 'x', slice: null })).toBe('?{x}');
  });

  it('appends slice OUTSIDE the wrap', () => {
    expect(serializeQueryString({ body: 'x', slice: '[0]' })).toBe('?{x}[0]');
    expect(serializeQueryString({ body: '${ref(m).c}', slice: '[1:5]' })).toBe(
      '?{${ref(m).c}}[1:5]'
    );
  });

  it('round-trips with parseQueryString', () => {
    const cases = ['?{x}', '?{x}[0]', '?{x}[-1]', '?{x}[1:5]', '?{${ref(m).c}}[0]'];
    cases.forEach(input => {
      const parsed = parseQueryString(input);
      expect(serializeQueryString(parsed)).toBe(input);
    });
  });
});

describe('isScalarSlice', () => {
  it.each([
    ['[0]', true],
    ['[-1]', true],
    ['[42]', true],
    ['[1:5]', false],
    ['[::2]', false],
    ['[0,-1]', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('isScalarSlice(%j) === %j', (slice, expected) => {
    expect(isScalarSlice(slice)).toBe(expected);
  });
});

describe('describeSlice', () => {
  it.each([
    [null, 'All values'],
    ['', 'All values'],
    ['[0]', 'First (0)'],
    ['[-1]', 'Last (-1)'],
    ['[3]', 'Row 3'],
    ['[-3]', 'Row -3'],
    ['[1:5]', 'Rows 1-5'],
    ['[:3]', 'Rows 0-3'],
    ['[2:]', 'Rows 2-end'],
    ['[1:10:2]', '[1:10:2]'],
    ['[0,2]', '[0,2]'],
  ])('describeSlice(%j) === %j', (slice, label) => {
    expect(describeSlice(slice)).toBe(label);
  });
});

describe('QueryString slice support', () => {
  it('extracts body via getValue when slice present', () => {
    expect(new QueryString('?{my_col}[0]').getValue()).toBe('my_col');
  });

  it('returns slice via getSlice', () => {
    expect(new QueryString('?{my_col}').getSlice()).toBeNull();
    expect(new QueryString('?{my_col}[0]').getSlice()).toBe('[0]');
    expect(new QueryString('?{my_col}[1:5]').getSlice()).toBe('[1:5]');
  });

  it('isQueryString accepts new slice forms', () => {
    expect(QueryString.isQueryString('?{x}[0]')).toBe(true);
    expect(QueryString.isQueryString('?{x}[1:5]')).toBe(true);
  });
});
