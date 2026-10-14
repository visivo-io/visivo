/* global BigInt */
import {
  DateDay,
  DateMillisecond,
  Decimal,
  Field,
  Int64,
  List,
  TimestampMicrosecond,
  TimestampMillisecond,
  TimestampNanosecond,
  TimestampSecond,
  Table,
  vectorFromArray,
} from 'apache-arrow';
import { getTimestampColumns, processArrowResult, toPlainValue } from './resultProcessing';
import { mapQueryResultsToProps } from '../models/Insight';

function decimalWords(integer) {
  const bits = BigInt.asUintN(128, BigInt(integer));
  return Uint32Array.from({ length: 4 }, (_, i) => Number((bits >> BigInt(32 * i)) & 0xffffffffn));
}

function decimalTable(integers, scale = 0) {
  return tableOf({
    weight: vectorFromArray(
      integers.map(value => (value === null ? null : decimalWords(value))),
      new Decimal(scale, 38)
    ),
  });
}

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

  test('safe bigints become numbers, unsafe ones stay strings, other values pass through', () => {
    const table = tableOf({
      count: vectorFromArray([42n]),
      big: vectorFromArray([9007199254740993n]),
      label: vectorFromArray(['north']),
      amount: vectorFromArray([1.5]),
    });
    const [row] = processArrowResult(table);
    expect(row.count).toBe(42);
    expect(row.big).toBe('9007199254740993');
    expect(row.label).toBe('north');
    expect(row.amount).toBe(1.5);
  });

  test('nested LIST cells become plain arrays of numbers', () => {
    const listOf = child => new List(new Field('item', child, true));
    const table = tableOf({
      pixels: vectorFromArray(
        [
          [
            [210n, 89n, 70n],
            [113n, 59n, 87n],
          ],
          null,
        ],
        listOf(listOf(new Int64()))
      ),
    });
    const rows = processArrowResult(table);
    expect(rows[0].pixels).toEqual([
      [210, 89, 70],
      [113, 59, 87],
    ]);
    expect(Array.isArray(rows[0].pixels[0])).toBe(true);
    expect(rows[1].pixels).toBeNull();
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

describe('processArrowResult decimal handling', () => {
  test('uncast integer sums reach heatmap weights as numeric values', () => {
    const table = decimalTable(['1', '2', '60']);
    expect(table.getChild('weight').get(0).constructor.name).toBe('DecimalBigNum');
    const props = mapQueryResultsToProps(processArrowResult(table), {
      'props.z': 'weight',
    });
    expect(props.z).toEqual([1, 2, 60]);
    expect(props.z.every(Number.isFinite)).toBe(true);
  });

  test.each([
    ['12345', 2, '123.45'],
    ['-12345', 2, '-123.45'],
    ['1', 3, '0.001'],
    ['-1', 3, '-0.001'],
    ['0', 2, '0.00'],
    ['12300', 2, '123.00'],
    ['12', -2, '1200'],
    ['-12', -2, '-1200'],
    ['0', -2, '0'],
  ])('coefficient %s with scale %s renders as %s', (integer, scale, expected) => {
    expect(processArrowResult(decimalTable([integer], scale))).toEqual([{ weight: expected }]);
  });

  test('preserves full decimal128 precision and nulls', () => {
    const large = '99999999999999999999999999999999999999';
    const table = decimalTable([large, `-${large}`, null], 2);
    const positive = `${large.slice(0, -2)}.${large.slice(-2)}`;
    expect(processArrowResult(table)).toEqual([
      { weight: positive },
      { weight: `-${positive}` },
      { weight: null },
    ]);
  });

  test('columns with different scales use their own metadata', () => {
    const table = tableOf({
      count: vectorFromArray([decimalWords('123')], new Decimal(0, 38)),
      price: vectorFromArray([decimalWords('123')], new Decimal(2, 38)),
      label: vectorFromArray(['00123']),
    });
    expect(processArrowResult(table)).toEqual([{ count: '123', price: '1.23', label: '00123' }]);
  });

  test('map bindings become numeric while source data, text and nulls stay intact', () => {
    const table = tableOf({
      price: vectorFromArray([decimalWords('-12345'), null], new Decimal(2, 38)),
      count: vectorFromArray([63n, 0n]),
      label: vectorFromArray(['00123', '00456']),
    });
    const rows = processArrowResult(table);
    const props = mapQueryResultsToProps(rows, {
      'props.lat': 'price',
      'props.z': 'count',
      'props.text': 'label',
    });
    expect(props).toEqual({ lat: [-123.45, null], z: [63, 0], text: ['00123', '00456'] });
    expect(rows).toEqual([
      { price: '-123.45', count: 63, label: '00123' },
      { price: null, count: 0, label: '00456' },
    ]);
  });
});

describe('toPlainValue', () => {
  test.each([
    [9007199254740991n, Number.MAX_SAFE_INTEGER],
    [-9007199254740991n, Number.MIN_SAFE_INTEGER],
    [9007199254740992n, '9007199254740992'],
    [-9007199254740992n, '-9007199254740992'],
  ])('%p becomes %p', (input, expected) => {
    expect(toPlainValue(input)).toBe(expected);
  });

  test('leaves non-bigint, non-vector values untouched', () => {
    const obj = { a: 1 };
    expect(toPlainValue(obj)).toBe(obj);
    expect(toPlainValue('7')).toBe('7');
    expect(toPlainValue(null)).toBeNull();
  });
});
