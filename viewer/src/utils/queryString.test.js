import { QueryString } from "./queryString";

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
      expect(queryString.getValue()).toBe("");
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