import { computeGradientStyles } from './cellFormatting';

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
      scope: 'columns',
      min_color: '#ff0000',
      max_color: '#00ff00',
    });
    expect(result.size).toBe(0);
  });

  it('returns empty map when no numeric columns', () => {
    const result = computeGradientStyles(rows, [], {
      scope: 'columns',
      min_color: '#ff0000',
      max_color: '#00ff00',
    });
    expect(result.size).toBe(0);
  });

  describe('scope: columns', () => {
    it('computes gradient per column', () => {
      const result = computeGradientStyles(rows, numericCols, {
        scope: 'columns',
        min_color: '#ff0000',
        max_color: '#00ff00',
      });

      // Column 'a' min=0, max=100 -> row 0 ratio=0 (red), row 2 ratio=1 (green)
      expect(result.get('0-a')).toEqual({ backgroundColor: 'rgb(255, 0, 0)' });
      expect(result.get('2-a')).toEqual({ backgroundColor: 'rgb(0, 255, 0)' });

      // Column 'a' row 1: ratio=0.5
      expect(result.get('1-a')).toEqual({ backgroundColor: 'rgb(128, 128, 0)' });

      // Column 'b' min=10, max=30 -> row 0 ratio=0, row 2 ratio=1
      expect(result.get('0-b')).toEqual({ backgroundColor: 'rgb(255, 0, 0)' });
      expect(result.get('2-b')).toEqual({ backgroundColor: 'rgb(0, 255, 0)' });
    });
  });

  describe('scope: rows_and_columns', () => {
    it('computes gradient globally', () => {
      const result = computeGradientStyles(rows, numericCols, {
        scope: 'rows_and_columns',
        min_color: '#000000',
        max_color: '#ffffff',
      });

      // Global min=0 (a[0]), max=100 (a[2])
      expect(result.get('0-a')).toEqual({ backgroundColor: 'rgb(0, 0, 0)' }); // 0/100
      expect(result.get('2-a')).toEqual({ backgroundColor: 'rgb(255, 255, 255)' }); // 100/100
      expect(result.get('0-b')).toEqual({ backgroundColor: 'rgb(26, 26, 26)' }); // 10/100
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
      expect(result.get('0-a')).toEqual({ backgroundColor: 'rgb(255, 0, 0)' });
      expect(result.get('0-b')).toEqual({ backgroundColor: 'rgb(0, 255, 0)' });
    });
  });

  it('handles equal min/max (no gradient applied)', () => {
    const sameRows = [{ a: 5 }, { a: 5 }];
    const result = computeGradientStyles(sameRows, ['a'], {
      scope: 'columns',
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
      { scope: 'columns', min_color: '#f00', max_color: '#0f0' }
    );
    expect(result.get('0-a')).toEqual({ backgroundColor: 'rgb(255, 0, 0)' });
    expect(result.get('1-a')).toEqual({ backgroundColor: 'rgb(0, 255, 0)' });
  });
});
