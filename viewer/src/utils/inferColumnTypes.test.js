import { inferColumnTypes } from './inferColumnTypes';
import { COLUMN_TYPES } from '../duckdb/schemaUtils';

describe('inferColumnTypes', () => {
  it('returns empty array for empty columns', () => {
    const result = inferColumnTypes([], []);
    expect(result).toEqual([]);
  });

  it('infers number type from numeric values', () => {
    const result = inferColumnTypes(['count'], [{ count: 42 }]);
    expect(result).toEqual([
      { name: 'count', normalizedType: COLUMN_TYPES.NUMBER, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('infers string type from string values', () => {
    const result = inferColumnTypes(['name'], [{ name: 'John' }]);
    expect(result).toEqual([
      { name: 'name', normalizedType: COLUMN_TYPES.STRING, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('infers boolean type from boolean values', () => {
    const result = inferColumnTypes(['active'], [{ active: true }]);
    expect(result).toEqual([
      { name: 'active', normalizedType: COLUMN_TYPES.BOOLEAN, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('infers date type from YYYY-MM-DD strings', () => {
    const result = inferColumnTypes(['created'], [{ created: '2024-01-15' }]);
    expect(result).toEqual([
      { name: 'created', normalizedType: COLUMN_TYPES.DATE, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('infers timestamp type from ISO datetime strings', () => {
    const result = inferColumnTypes(['updated'], [{ updated: '2024-01-15T10:30:00Z' }]);
    expect(result).toEqual([
      { name: 'updated', normalizedType: COLUMN_TYPES.TIMESTAMP, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('infers timestamp type from datetime with space separator', () => {
    const result = inferColumnTypes(['updated'], [{ updated: '2024-01-15 10:30:00' }]);
    expect(result).toEqual([
      { name: 'updated', normalizedType: COLUMN_TYPES.TIMESTAMP, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('infers unknown type for null values', () => {
    const result = inferColumnTypes(['missing'], [{ missing: null }]);
    expect(result).toEqual([
      { name: 'missing', normalizedType: COLUMN_TYPES.UNKNOWN, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('infers unknown type for undefined values', () => {
    const result = inferColumnTypes(['missing'], [{ missing: undefined }]);
    expect(result).toEqual([
      { name: 'missing', normalizedType: COLUMN_TYPES.UNKNOWN, duckdbType: 'UNKNOWN' },
    ]);
  });

  it('handles multiple columns', () => {
    const result = inferColumnTypes(
      ['id', 'name', 'active'],
      [{ id: 1, name: 'Test', active: false }]
    );
    expect(result).toHaveLength(3);
    expect(result[0].normalizedType).toBe(COLUMN_TYPES.NUMBER);
    expect(result[1].normalizedType).toBe(COLUMN_TYPES.STRING);
    expect(result[2].normalizedType).toBe(COLUMN_TYPES.BOOLEAN);
  });

  it('handles empty rows by returning unknown types', () => {
    const result = inferColumnTypes(['id', 'name'], []);
    expect(result).toEqual([
      { name: 'id', normalizedType: COLUMN_TYPES.UNKNOWN, duckdbType: 'UNKNOWN' },
      { name: 'name', normalizedType: COLUMN_TYPES.UNKNOWN, duckdbType: 'UNKNOWN' },
    ]);
  });
});
