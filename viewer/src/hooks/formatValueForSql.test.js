import {formatValueForSql} from './utilities/formatValueForSql';

describe('formatValueForSql', () => {
  describe('null and undefined handling', () => {
    it('should handle null values', () => {
      expect(formatValueForSql(null, 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql(null, 'VARCHAR')).toBe('NULL');
    });

    it('should handle undefined values', () => {
      expect(formatValueForSql(undefined, 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql(undefined, 'VARCHAR')).toBe('NULL');
    });
  });

  describe('DOUBLE column type', () => {
    it('should handle numeric values', () => {
      expect(formatValueForSql(42, 'DOUBLE')).toBe(42);
      expect(formatValueForSql(42.5, 'DOUBLE')).toBe(42.5);
      expect(formatValueForSql(0, 'DOUBLE')).toBe(0);
      expect(formatValueForSql(-123.45, 'DOUBLE')).toBe(-123.45);
    });

    it('should handle numeric strings', () => {
      expect(formatValueForSql('42', 'DOUBLE')).toBe(42);
      expect(formatValueForSql('42.5', 'DOUBLE')).toBe(42.5);
      expect(formatValueForSql('0', 'DOUBLE')).toBe(0);
      expect(formatValueForSql('-123.45', 'DOUBLE')).toBe(-123.45);
    });

    it('should handle formatted numeric strings', () => {
      expect(formatValueForSql('$1,000.50', 'DOUBLE')).toBe(1000.50);
      expect(formatValueForSql('1 000', 'DOUBLE')).toBe(1000);
      expect(formatValueForSql('$1,234,567.89', 'DOUBLE')).toBe(1234567.89);
      expect(formatValueForSql('  123.45  ', 'DOUBLE')).toBe(123.45);
    });

    it('should handle empty and dash values', () => {
      expect(formatValueForSql('-', 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql('', 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql('   ', 'DOUBLE')).toBe('NULL');
    });

    it('should handle invalid numeric strings', () => {
      expect(formatValueForSql('abc', 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql('12.34.56', 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql('not a number', 'DOUBLE')).toBe('NULL');
    });

    it('should handle non-string, non-number types', () => {
      expect(formatValueForSql(true, 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql([], 'DOUBLE')).toBe('NULL');
      expect(formatValueForSql({}, 'DOUBLE')).toBe('NULL');
    });
  });

  describe('VARCHAR column type', () => {
    it('should handle regular strings', () => {
      expect(formatValueForSql('hello', 'VARCHAR')).toBe("'hello'");
      expect(formatValueForSql('world', 'VARCHAR')).toBe("'world'");
    });

    it('should trim and lowercase strings', () => {
      expect(formatValueForSql('  HELLO  ', 'VARCHAR')).toBe("'hello'");
      expect(formatValueForSql('MiXeD cAsE', 'VARCHAR')).toBe("'mixed case'");
      expect(formatValueForSql('\tTabbed\n', 'VARCHAR')).toBe("'tabbed'");
    });

    it('should escape single quotes', () => {
      expect(formatValueForSql("O'Connor", 'VARCHAR')).toBe("'o''connor'");
      expect(formatValueForSql("It's a test", 'VARCHAR')).toBe("'it''s a test'");
      expect(formatValueForSql("'quoted'", 'VARCHAR')).toBe("'''quoted'''");
    });

    it('should handle numbers as strings', () => {
      expect(formatValueForSql(123, 'VARCHAR')).toBe("'123'");
      expect(formatValueForSql(45.67, 'VARCHAR')).toBe("'45.67'");
    });

    it('should handle boolean values as strings', () => {
      expect(formatValueForSql(true, 'VARCHAR')).toBe("'true'");
      expect(formatValueForSql(false, 'VARCHAR')).toBe("'false'");
    });

    it('should handle empty strings', () => {
      expect(formatValueForSql('', 'VARCHAR')).toBe("''");
      expect(formatValueForSql('   ', 'VARCHAR')).toBe("''");
    });

    it('should handle objects and arrays as strings', () => {
      expect(formatValueForSql([1, 2, 3], 'VARCHAR')).toBe("'1,2,3'");
      expect(formatValueForSql({ a: 1 }, 'VARCHAR')).toBe("'[object object]'");
    });
  });

  describe('edge cases', () => {
    it('should handle unknown column types as VARCHAR', () => {
      expect(formatValueForSql('test', 'UNKNOWN')).toBe("'test'");
      expect(formatValueForSql('test', 'TEXT')).toBe("'test'");
      expect(formatValueForSql('test', null)).toBe("'test'");
    });
  });
});