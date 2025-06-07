import sanitizeColumnName from './sanitizeColumnName';

describe('sanitizeColumnName', () => {
  test('handles null and undefined', () => {
    expect(sanitizeColumnName(null)).toBe('null');
    expect(sanitizeColumnName(undefined)).toBe('null');
  });

  test('converts non-string values to strings', () => {
    expect(sanitizeColumnName(123)).toBe('123');
    expect(sanitizeColumnName(0)).toBe('0');
    expect(sanitizeColumnName(true)).toBe('true');
    expect(sanitizeColumnName(false)).toBe('false');
  });

  test('replaces special characters with underscores', () => {
    expect(sanitizeColumnName('column.name')).toBe('column_name');
    expect(sanitizeColumnName('column-name')).toBe('column_name');
    expect(sanitizeColumnName('column:name')).toBe('column_name');
    expect(sanitizeColumnName('column@name')).toBe('column_name');
    expect(sanitizeColumnName('column!name')).toBe('column_name');
  });

  test('replaces whitespace with underscores', () => {
    expect(sanitizeColumnName('column name')).toBe('column_name');
    expect(sanitizeColumnName('column  name')).toBe('column__name');
    expect(sanitizeColumnName('column\tname')).toBe('column_name');
    expect(sanitizeColumnName('column\nname')).toBe('column_name');
  });

  test('preserves alphanumeric characters and underscores', () => {
    expect(sanitizeColumnName('column_name123')).toBe('column_name123');
    expect(sanitizeColumnName('_column_name')).toBe('_column_name');
    expect(sanitizeColumnName('COLUMN_NAME')).toBe('COLUMN_NAME');
  });

  test('handles complex cases', () => {
    expect(sanitizeColumnName('item.price ($)')).toBe('item_price____');
    expect(sanitizeColumnName('user email@domain.com')).toBe('user_email_domain_com');
    expect(sanitizeColumnName('  leading spaces')).toBe('__leading_spaces');
  });
});