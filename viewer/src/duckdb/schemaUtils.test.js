import { normalizeColumnType, parseSchema, calculateColumnWidth, COLUMN_TYPES } from './schemaUtils';

describe('normalizeColumnType', () => {
  it('maps INTEGER to number', () => {
    expect(normalizeColumnType('INTEGER')).toBe(COLUMN_TYPES.NUMBER);
  });
  it('maps BIGINT to number', () => {
    expect(normalizeColumnType('BIGINT')).toBe(COLUMN_TYPES.NUMBER);
  });
  it('maps FLOAT to number', () => {
    expect(normalizeColumnType('FLOAT')).toBe(COLUMN_TYPES.NUMBER);
  });
  it('maps DOUBLE to number', () => {
    expect(normalizeColumnType('DOUBLE')).toBe(COLUMN_TYPES.NUMBER);
  });
  it('maps DECIMAL(10,2) to number', () => {
    expect(normalizeColumnType('DECIMAL(10,2)')).toBe(COLUMN_TYPES.NUMBER);
  });
  it('maps VARCHAR to string', () => {
    expect(normalizeColumnType('VARCHAR')).toBe(COLUMN_TYPES.STRING);
  });
  it('maps TEXT to string', () => {
    expect(normalizeColumnType('TEXT')).toBe(COLUMN_TYPES.STRING);
  });
  it('maps DATE to date', () => {
    expect(normalizeColumnType('DATE')).toBe(COLUMN_TYPES.DATE);
  });
  it('maps TIMESTAMP to timestamp', () => {
    expect(normalizeColumnType('TIMESTAMP')).toBe(COLUMN_TYPES.TIMESTAMP);
  });
  it('maps TIMESTAMP WITH TIME ZONE to timestamp', () => {
    expect(normalizeColumnType('TIMESTAMP WITH TIME ZONE')).toBe(COLUMN_TYPES.TIMESTAMP);
  });
  it('maps BOOLEAN to boolean', () => {
    expect(normalizeColumnType('BOOLEAN')).toBe(COLUMN_TYPES.BOOLEAN);
  });
  it('maps unknown types to unknown', () => {
    expect(normalizeColumnType('STRUCT')).toBe(COLUMN_TYPES.UNKNOWN);
  });
  it('handles null input', () => {
    expect(normalizeColumnType(null)).toBe(COLUMN_TYPES.UNKNOWN);
  });
});

describe('calculateColumnWidth', () => {
  it('returns minimum width for short names', () => {
    const width = calculateColumnWidth('id', 'number');
    expect(width).toBe(120);
  });

  it('scales width with name length', () => {
    const shortWidth = calculateColumnWidth('id', 'string');
    const longWidth = calculateColumnWidth('customer_email_address', 'string');
    expect(longWidth).toBeGreaterThan(shortWidth);
  });

  it('gives enough width for long column names', () => {
    const width = calculateColumnWidth('very_long_column_name_here', 'string');
    // 26 chars * 7 + 92 = 274
    expect(width).toBe(274);
  });

  it('never goes below minimum width', () => {
    const width = calculateColumnWidth('x', 'number');
    expect(width).toBe(120);
  });
});

describe('parseSchema', () => {
  it('parses DESCRIBE result rows', () => {
    const describeRows = [
      {
        column_name: 'id',
        column_type: 'INTEGER',
        null: 'YES',
        key: null,
        default: null,
        extra: null,
      },
      {
        column_name: 'name',
        column_type: 'VARCHAR',
        null: 'YES',
        key: null,
        default: null,
        extra: null,
      },
    ];
    const schema = parseSchema(describeRows);
    expect(schema).toEqual([
      { name: 'id', duckdbType: 'INTEGER', normalizedType: 'number' },
      { name: 'name', duckdbType: 'VARCHAR', normalizedType: 'string' },
    ]);
  });
});
