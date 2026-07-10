import { coerceServerRowsForDuckDB, selectWithDateCasts } from './coerceRows';

describe('coerceServerRowsForDuckDB', () => {
  test('rewrites RFC-1123 date strings to naive ISO and reports the date columns', () => {
    const rows = [
      { date: 'Mon, 01 Jan 2024 00:00:00 GMT', value: 1 },
      { date: 'Tue, 02 Jan 2024 12:34:56 GMT', value: 2 },
    ];
    const { rows: out, dateColumns } = coerceServerRowsForDuckDB(rows);
    expect(out[0].date).toBe('2024-01-01T00:00:00.000');
    expect(out[1].date).toBe('2024-01-02T12:34:56.000');
    expect(out[0].value).toBe(1); // non-date columns untouched
    expect(dateColumns).toEqual(['date']);
  });

  test('leaves category / text columns untouched (no false positives)', () => {
    const rows = [
      { category: 'Category A', region: 'North', quarter: 'Q1', year: '2024', code: 'GMT' },
    ];
    const { rows: out, dateColumns } = coerceServerRowsForDuckDB(rows);
    expect(out[0]).toEqual(rows[0]);
    expect(dateColumns).toEqual([]);
  });

  test('flags ISO date columns for casting without rewriting them (cloud/ISO backend)', () => {
    const rows = [
      { ts: '2024-01-01T00:00:00', d: '2024-06-15', tz: '2024-01-01 00:00:00.000Z', value: 1 },
    ];
    const { rows: out, dateColumns } = coerceServerRowsForDuckDB(rows);
    // Not rewritten (already CAST-friendly)…
    expect(out[0].ts).toBe('2024-01-01T00:00:00');
    expect(out[0].d).toBe('2024-06-15');
    // …but flagged so the caller force-casts (read_json_auto won't type them).
    expect(dateColumns.sort()).toEqual(['d', 'ts', 'tz']);
  });

  test('returns the SAME array reference when nothing matched (cheap no-op)', () => {
    const rows = [{ a: 1, b: 'x' }];
    expect(coerceServerRowsForDuckDB(rows).rows).toBe(rows);
  });

  test('does not mutate the input rows', () => {
    const rows = [{ date: 'Mon, 01 Jan 2024 00:00:00 GMT' }];
    coerceServerRowsForDuckDB(rows);
    expect(rows[0].date).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
  });

  test('tolerates empty / non-array / null-row inputs', () => {
    expect(coerceServerRowsForDuckDB([])).toEqual({ rows: [], dateColumns: [] });
    expect(coerceServerRowsForDuckDB(null)).toEqual({ rows: null, dateColumns: [] });
    const mixed = coerceServerRowsForDuckDB([null, { date: 'Mon, 01 Jan 2024 00:00:00 GMT' }]);
    expect(mixed.rows[1].date).toBe('2024-01-01T00:00:00.000');
    expect(mixed.dateColumns).toEqual(['date']);
  });
});

describe('selectWithDateCasts', () => {
  test('returns * when there are no date columns', () => {
    expect(selectWithDateCasts([])).toBe('*');
    expect(selectWithDateCasts(undefined)).toBe('*');
  });

  test('force-casts each date column to TIMESTAMP via * REPLACE', () => {
    expect(selectWithDateCasts(['date'])).toBe('* REPLACE (CAST("date" AS TIMESTAMP) AS "date")');
    expect(selectWithDateCasts(['a', 'b'])).toBe(
      '* REPLACE (CAST("a" AS TIMESTAMP) AS "a", CAST("b" AS TIMESTAMP) AS "b")'
    );
  });
});
