import {
  DateDay,
  DateMillisecond,
  TimestampMicrosecond,
  TimestampMillisecond,
  TimestampNanosecond,
  TimestampSecond,
  Table,
  vectorFromArray,
} from 'apache-arrow';
import { getTimestampColumns, processArrowResult } from './resultProcessing';

// 2026-06-01T00:00:00Z — the exact value from the B7 field-test repro
// (1,780,272,000 epoch seconds, which the old `/ 1000` rendered as
// 1970-01-21T14:31Z).
const ISO = '2026-06-01T00:00:00.000Z';
const EPOCH_MS = Date.parse(ISO);

const tableOf = columns => new Table(columns);

describe('processArrowResult timestamp handling (B7)', () => {
  test.each([
    ['TimestampSecond', new TimestampSecond()],
    ['TimestampMillisecond', new TimestampMillisecond()],
    ['TimestampMicrosecond', new TimestampMicrosecond()],
    ['TimestampNanosecond', new TimestampNanosecond()],
    ['DateMillisecond', new DateMillisecond()],
    ['DateDay', new DateDay()],
  ])('%s round-trips to the same correct ISO string', (_label, type) => {
    const table = tableOf({ ts: vectorFromArray([new Date(EPOCH_MS)], type) });
    const rows = processArrowResult(table);
    expect(rows).toHaveLength(1);
    expect(rows[0].ts).toBe(ISO);
  });

  test('2026 never renders as 1970 (the /1000 regression)', () => {
    const table = tableOf({
      ts: vectorFromArray([new Date(EPOCH_MS)], new TimestampMicrosecond()),
    });
    const [row] = processArrowResult(table);
    expect(row.ts.startsWith('2026-')).toBe(true);
    expect(row.ts).not.toContain('1970');
  });

  test('a 60-day daily series spans 60 real days, not ~70 minutes', () => {
    const dates = Array.from({ length: 60 }, (_, i) => new Date(EPOCH_MS + i * 86_400_000));
    const table = tableOf({ day: vectorFromArray(dates, new TimestampMillisecond()) });
    const rows = processArrowResult(table);
    const first = Date.parse(rows[0].day);
    const last = Date.parse(rows[59].day);
    expect(last - first).toBe(59 * 86_400_000);
  });

  test('null timestamps pass through as null', () => {
    const table = tableOf({
      ts: vectorFromArray([new Date(EPOCH_MS), null], new TimestampMillisecond()),
    });
    const rows = processArrowResult(table);
    expect(rows[0].ts).toBe(ISO);
    expect(rows[1].ts).toBeNull();
  });

  test('non-timestamp bigints stringify; other values pass through untouched', () => {
    const table = tableOf({
      big: vectorFromArray([9007199254740993n]),
      label: vectorFromArray(['north']),
      amount: vectorFromArray([1.5]),
    });
    const [row] = processArrowResult(table);
    expect(row.big).toBe('9007199254740993');
    expect(row.label).toBe('north');
    expect(row.amount).toBe(1.5);
  });
});

describe('getTimestampColumns', () => {
  test('collects timestamp and date fields, ignores the rest', () => {
    const table = tableOf({
      ts: vectorFromArray([new Date(EPOCH_MS)], new TimestampMillisecond()),
      day: vectorFromArray([new Date(EPOCH_MS)], new DateDay()),
      label: vectorFromArray(['x']),
    });
    expect(getTimestampColumns(table.schema)).toEqual(new Set(['ts', 'day']));
  });

  test('tolerates a missing schema', () => {
    expect(getTimestampColumns(undefined)).toEqual(new Set());
    expect(getTimestampColumns({})).toEqual(new Set());
  });
});
