import {
  computeGradientStyles,
  toGradientNumber,
  selectGradientColumns,
  stringifyValue,
} from './cellFormatting';

describe('stringifyValue', () => {
  it('prints BigInts nested in structs and lists as their digits', () => {
    expect(stringifyValue({ _0: 9007199254740993n, tags: [2n] })).toBe(
      '{"_0":"9007199254740993","tags":["2"]}'
    );
  });

  it('matches JSON.stringify for plain values', () => {
    expect(stringifyValue({ a: 1, b: ['x', null] })).toBe('{"a":1,"b":["x",null]}');
  });
});

describe('computeGradientStyles', () => {
  const rows = [
    { a: 0, b: 10, c: 'text' },
    { a: 50, b: 20, c: 'text' },
    { a: 100, b: 30, c: 'text' },
  ];
  const numericCols = ['a', 'b'];

  it('returns empty map when no formatCells config', () => {
    const result = computeGradientStyles(rows, numericCols, null);
    expect(result.size).toBe(0);
  });

  it('returns empty map when no rows', () => {
    const result = computeGradientStyles([], numericCols, {
      scope: 'column',
      min_color: '#ff0000',
      max_color: '#00ff00',
    });
    expect(result.size).toBe(0);
  });

  it('returns empty map when no numeric columns', () => {
    const result = computeGradientStyles(rows, [], {
      scope: 'column',
      min_color: '#ff0000',
      max_color: '#00ff00',
    });
    expect(result.size).toBe(0);
  });

  describe('scope: column', () => {
    it('computes gradient per column', () => {
      const result = computeGradientStyles(rows, numericCols, {
        scope: 'column',
        min_color: '#ff0000',
        max_color: '#00ff00',
      });

      // Column 'a' min=0, max=100 -> row 0 ratio=0 (red), row 2 ratio=1 (green)
      expect(result.get('0-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(255, 0, 0)' }));
      expect(result.get('2-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(0, 255, 0)' }));

      // Column 'a' row 1: ratio=0.5
      expect(result.get('1-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(128, 128, 0)' }));

      // Column 'b' min=10, max=30 -> row 0 ratio=0, row 2 ratio=1
      expect(result.get('0-b')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(255, 0, 0)' }));
      expect(result.get('2-b')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(0, 255, 0)' }));
    });
  });

  describe('scope: table', () => {
    it('computes gradient globally', () => {
      const result = computeGradientStyles(rows, numericCols, {
        scope: 'table',
        min_color: '#000000',
        max_color: '#ffffff',
      });

      // Global min=0 (a[0]), max=100 (a[2])
      expect(result.get('0-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(0, 0, 0)' })); // 0/100
      expect(result.get('2-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(255, 255, 255)' })); // 100/100
      expect(result.get('0-b')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(26, 26, 26)' })); // 10/100
    });
  });

  describe('scope: row', () => {
    it('computes gradient per row', () => {
      const result = computeGradientStyles(rows, numericCols, {
        scope: 'row',
        min_color: '#ff0000',
        max_color: '#00ff00',
      });

      // Row 0: min=0 (a), max=10 (b) -> a ratio=0, b ratio=1
      expect(result.get('0-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(255, 0, 0)' }));
      expect(result.get('0-b')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(0, 255, 0)' }));
    });
  });

  it('handles equal min/max (no gradient applied)', () => {
    const sameRows = [{ a: 5 }, { a: 5 }];
    const result = computeGradientStyles(sameRows, ['a'], {
      scope: 'column',
      min_color: '#ff0000',
      max_color: '#00ff00',
    });
    // range is 0, so no styles applied
    expect(result.size).toBe(0);
  });

  it('handles shorthand hex colors', () => {
    const result = computeGradientStyles(
      [{ a: 0 }, { a: 100 }],
      ['a'],
      { scope: 'column', min_color: '#f00', max_color: '#0f0' }
    );
    expect(result.get('0-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(255, 0, 0)' }));
    expect(result.get('1-a')).toEqual(expect.objectContaining({ backgroundColor: 'rgb(0, 255, 0)' }));
  });

  it('picks a readable text color for each gradient cell', () => {
    const result = computeGradientStyles(
      [{ a: 0 }, { a: 1 }],
      ['a'],
      { scope: 'column', min_color: '#000000', max_color: '#ffffff' }
    );
    expect(result.get('0-a').color).toBe('#ffffff');
    expect(result.get('1-a').color).toBe('#1d2136');
  });
});

// ---------------------------------------------------------------------------
// VIS-1463 T4: whole-table range, nulls untouched, measure-column selection
// ---------------------------------------------------------------------------
describe('toGradientNumber', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['   ', null],
    [true, null],
    [false, null],
    [NaN, null],
    [Infinity, null],
    ['abc', null],
    [{}, null],
    [0, 0],
    [-2.5, -2.5],
    ['42', 42],
    [10n, 10],
  ])('maps %p to %p', (input, expected) => {
    expect(toGradientNumber(input)).toBe(expected);
  });
});

describe('computeGradientStyles — nulls and whole-table range', () => {
  const cfg = { scope: 'table', min_color: '#000000', max_color: '#ffffff' };

  it('leaves null / empty cells uncoloured and excludes them from the range', () => {
    const rows = [{ a: null, b: 10 }, { a: '', b: 20 }, { a: undefined, b: 30 }];
    const result = computeGradientStyles(rows, ['a', 'b'], cfg);
    expect(result.has('0-a')).toBe(false);
    expect(result.has('1-a')).toBe(false);
    expect(result.has('2-a')).toBe(false);
    // Range is 10..30 (NOT 0..30 — null is not 0), so b=10 is the pure minimum.
    expect(result.get('0-b').backgroundColor).toBe('rgb(0, 0, 0)');
    expect(result.get('1-b').backgroundColor).toBe('rgb(128, 128, 128)');
    expect(result.get('2-b').backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('a row of only nulls contributes nothing under scope: row', () => {
    const result = computeGradientStyles([{ a: null, b: null }, { a: 1, b: 2 }], ['a', 'b'], {
      ...cfg,
      scope: 'row',
    });
    expect(result.has('0-a')).toBe(false);
    expect(result.has('0-b')).toBe(false);
    expect(result.get('1-a').backgroundColor).toBe('rgb(0, 0, 0)');
    expect(result.get('1-b').backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('a column with a single null among numbers keeps the numeric range under scope: column', () => {
    const result = computeGradientStyles([{ a: 5 }, { a: null }, { a: 15 }], ['a'], {
      ...cfg,
      scope: 'column',
    });
    expect(result.get('0-a').backgroundColor).toBe('rgb(0, 0, 0)');
    expect(result.has('1-a')).toBe(false);
    expect(result.get('2-a').backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('the same value gets the same colour wherever it sits in the table', () => {
    // 60 rows: value = index % 20 — row 1 and row 41 share value 1.
    const rows = Array.from({ length: 60 }, (_, i) => ({ v: i % 20, w: i * 2 }));
    const result = computeGradientStyles(rows, ['v', 'w'], cfg);
    expect(result.get('1-v')).toEqual(result.get('41-v'));
    // And the whole-table max (w=118) is the pure max colour, not a per-slice max.
    expect(result.get('59-w').backgroundColor).toBe('rgb(255, 255, 255)');
    expect(result.get('0-v').backgroundColor).toBe('rgb(0, 0, 0)');
  });

  it('treats numeric strings from the query result as numbers', () => {
    const result = computeGradientStyles([{ a: '0' }, { a: '10' }], ['a'], {
      ...cfg,
      scope: 'column',
    });
    expect(result.get('1-a').backgroundColor).toBe('rgb(255, 255, 255)');
  });
});

describe('selectGradientColumns', () => {
  const columns = [
    { name: 'product', isPivotRow: true },
    { name: 'East' },
    { name: 'West' },
  ];

  it('returns nothing without columns or rows', () => {
    expect(selectGradientColumns([], [{ a: 1 }], true)).toEqual([]);
    expect(selectGradientColumns(columns, [], true)).toEqual([]);
    expect(selectGradientColumns(undefined, undefined, false)).toEqual([]);
  });

  it('pivot mode: every non-row column is a measure, even when all its cells are null', () => {
    const rows = [{ product: 'A', East: null, West: 1 }];
    expect(selectGradientColumns(columns, rows, true)).toEqual(['East', 'West']);
  });

  it('non-pivot mode: only genuinely numeric columns qualify', () => {
    const cols = [
      { name: 'id' },
      { name: 'year' },
      { name: 'label' },
      { name: 'amount' },
      { name: 'big' },
      { name: 'empty' },
      { name: 'mixed' },
    ];
    const rows = [
      { id: '001', year: '2024', label: 'x', amount: 1.5, big: 10n, empty: null, mixed: 1 },
      { id: '002', year: '2025', label: 'y', amount: null, big: 20n, empty: null, mixed: 'two' },
    ];
    // id/year are numeric-LOOKING strings → not coloured; amount (with a null)
    // and big (bigint) are; an all-null column and a mixed column are not.
    expect(selectGradientColumns(cols, rows, false)).toEqual(['amount', 'big']);
  });
});
