/**
 * sanitizeDashboardConfig tests (VIS-802 / Track G G-1, GAP-3).
 *
 * Proves the auto-save normaliser strips the empty-string leaf fields + the
 * non-model `selector` key that the right-rail scaffolds produce, so the
 * persisted payload always satisfies the backend Item validator
 * (`only one of markdown/chart/table/input/rows should be set`).
 */
import sanitizeDashboardConfig from './sanitizeDashboardConfig';

describe('sanitizeDashboardConfig', () => {
  test('strips empty-string leaf fields + selector from a scaffold item', () => {
    const config = {
      name: 'd',
      rows: [
        {
          height: 'medium',
          items: [{ width: 1, chart: '', table: '', markdown: '', input: '', selector: '' }],
        },
      ],
    };
    const out = sanitizeDashboardConfig(config);
    expect(out.rows[0].items[0]).toEqual({ width: 1 });
    expect(out.name).toBe('d');
  });

  test('keeps the single real leaf ref and drops the empty siblings (mutual exclusion)', () => {
    const config = {
      rows: [
        {
          items: [
            { width: 2, chart: 'ref(rev)', table: '', markdown: '', input: '', selector: '' },
          ],
        },
      ],
    };
    const out = sanitizeDashboardConfig(config);
    expect(out.rows[0].items[0]).toEqual({ width: 2, chart: 'ref(rev)' });
  });

  test('preserves a real selector-free leaf and an object-stored leaf untouched', () => {
    const config = {
      rows: [{ items: [{ width: 1, chart: { name: 'c', path: 'charts.c' } }] }],
    };
    const out = sanitizeDashboardConfig(config);
    expect(out.rows[0].items[0]).toEqual({ width: 1, chart: { name: 'c', path: 'charts.c' } });
  });

  test('recurses into nested row-container items', () => {
    const config = {
      rows: [
        {
          items: [
            {
              width: 1,
              rows: [
                {
                  items: [{ width: 1, chart: 'ref(a)', table: '', selector: '' }, { width: 1 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const out = sanitizeDashboardConfig(config);
    const nested = out.rows[0].items[0].rows[0].items;
    expect(nested[0]).toEqual({ width: 1, chart: 'ref(a)' });
    expect(nested[1]).toEqual({ width: 1 });
  });

  test('does not mutate the input', () => {
    const item = { width: 1, chart: '', selector: '' };
    const config = { rows: [{ items: [item] }] };
    sanitizeDashboardConfig(config);
    expect(item).toEqual({ width: 1, chart: '', selector: '' });
  });

  test('returns non-object / rows-less config unchanged', () => {
    expect(sanitizeDashboardConfig(null)).toBe(null);
    expect(sanitizeDashboardConfig(undefined)).toBe(undefined);
    const noRows = { name: 'x' };
    expect(sanitizeDashboardConfig(noRows)).toBe(noRows);
  });

  test('treats whitespace-only leaf values as blank', () => {
    const config = { rows: [{ items: [{ width: 1, markdown: '   ' }] }] };
    expect(sanitizeDashboardConfig(config).rows[0].items[0]).toEqual({ width: 1 });
  });
});
