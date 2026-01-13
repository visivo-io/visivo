import { QueryString, isQueryStringValue } from './queryString';

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
});
