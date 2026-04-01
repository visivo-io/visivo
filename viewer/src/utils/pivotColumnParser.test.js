import { parsePivotColumnHierarchy } from './pivotColumnParser';

describe('parsePivotColumnHierarchy', () => {
  it('returns flat columns for single ON column + single value', () => {
    const resultKeys = ['product', 'east_sum("rev")', 'west_sum("rev")'];
    const resolvedRowCols = new Set(['product']);
    const resolvedPivotCols = ['region'];
    const aggInfo = [{ aggFunc: 'SUM', displayName: 'Revenue' }];
    const reverseMapping = { product: 'Product' };

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, reverseMapping);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: 'product', meta: { isPivotRow: true }, displayName: 'Product' });
    expect(result[1]).toMatchObject({ accessorKey: 'east_sum("rev")', displayName: 'East', meta: { isPivotRow: false } });
    expect(result[2]).toMatchObject({ accessorKey: 'west_sum("rev")', displayName: 'West', meta: { isPivotRow: false } });
    // No nesting — all top-level
    expect(result[1].columns).toBeUndefined();
  });

  it('creates one level of grouping for single ON column + multiple values', () => {
    const resultKeys = ['product', 'east_sum("rev")', 'east_avg("rev")', 'west_sum("rev")', 'west_avg("rev")'];
    const resolvedRowCols = new Set(['product']);
    const resolvedPivotCols = ['region'];
    const aggInfo = [
      { aggFunc: 'SUM', displayName: 'Revenue' },
      { aggFunc: 'AVG', displayName: 'Revenue' },
    ];
    const reverseMapping = {};

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, reverseMapping);

    // product (row) + 2 groups (east, west)
    expect(result).toHaveLength(3);
    expect(result[0].meta.isPivotRow).toBe(true);

    // East group
    expect(result[1].header).toBe('East');
    expect(result[1].meta.isGroupHeader).toBe(true);
    expect(result[1].columns).toHaveLength(2);
    expect(result[1].columns[0].displayName).toBe('SUM of Revenue');
    expect(result[1].columns[1].displayName).toBe('AVG of Revenue');

    // West group
    expect(result[2].header).toBe('West');
    expect(result[2].columns).toHaveLength(2);
  });

  it('creates multi-level nesting for multiple ON columns + multiple values', () => {
    const resultKeys = [
      'product',
      'east_Q1_sum("rev")', 'east_Q1_avg("rev")',
      'east_Q2_sum("rev")', 'east_Q2_avg("rev")',
      'west_Q1_sum("rev")', 'west_Q1_avg("rev")',
      'west_Q2_sum("rev")', 'west_Q2_avg("rev")',
    ];
    const resolvedRowCols = new Set(['product']);
    const resolvedPivotCols = ['region', 'quarter'];
    const aggInfo = [
      { aggFunc: 'SUM', displayName: 'Revenue' },
      { aggFunc: 'AVG', displayName: 'Revenue' },
    ];
    const reverseMapping = {};

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, reverseMapping);

    // product + east group + west group
    expect(result).toHaveLength(3);

    // East group
    const east = result[1];
    expect(east.header).toBe('East');
    expect(east.columns).toHaveLength(2); // Q1, Q2

    const eastQ1 = east.columns[0];
    expect(eastQ1.header).toBe('Q1');
    expect(eastQ1.columns).toHaveLength(2); // SUM, AVG
    expect(eastQ1.columns[0].accessorKey).toBe('east_Q1_sum("rev")');
    expect(eastQ1.columns[1].accessorKey).toBe('east_Q1_avg("rev")');
  });

  it('creates multi-level nesting for multiple ON columns + single value', () => {
    const resultKeys = [
      'product',
      'east_Q1_sum("rev")',
      'east_Q2_sum("rev")',
      'west_Q1_sum("rev")',
      'west_Q2_sum("rev")',
    ];
    const resolvedRowCols = new Set(['product']);
    const resolvedPivotCols = ['region', 'quarter'];
    const aggInfo = [{ aggFunc: 'SUM', displayName: 'Revenue' }];
    const reverseMapping = {};

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, reverseMapping);

    expect(result).toHaveLength(3); // product + east + west
    const east = result[1];
    expect(east.header).toBe('East');
    expect(east.columns).toHaveLength(2); // Q1, Q2
    // Single value: leaf nodes exist under each quarter
    expect(east.columns[0].header).toBe('Q1');
    expect(east.columns[0].columns).toHaveLength(1);
  });

  it('parses real DuckDB output with unquoted column names', () => {
    const resultKeys = [
      'category', 'channel',
      'East_Q1_sum(revenue)', 'East_Q1_avg(revenue)',
      'East_Q2_sum(revenue)', 'East_Q2_avg(revenue)',
      'North_Q1_sum(revenue)', 'North_Q1_avg(revenue)',
      'North_Q2_sum(revenue)', 'North_Q2_avg(revenue)',
    ];
    const resolvedRowCols = new Set(['category', 'channel']);
    const resolvedPivotCols = ['region', 'quarter'];
    const aggInfo = [
      { aggFunc: 'SUM', displayName: 'Revenue' },
      { aggFunc: 'AVG', displayName: 'Revenue' },
    ];

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, {});

    // 2 row cols + 2 region groups (East, North)
    expect(result).toHaveLength(4);
    expect(result[0].meta.isPivotRow).toBe(true);
    expect(result[1].meta.isPivotRow).toBe(true);

    const east = result[2];
    expect(east.header).toBe('East');
    expect(east.meta.isGroupHeader).toBe(true);
    expect(east.columns).toHaveLength(2); // Q1, Q2
    expect(east.columns[0].header).toBe('Q1');
    expect(east.columns[0].columns).toHaveLength(2); // SUM, AVG
    expect(east.columns[0].columns[0].accessorKey).toBe('East_Q1_sum(revenue)');
    expect(east.columns[0].columns[1].accessorKey).toBe('East_Q1_avg(revenue)');
  });

  it('handles row columns with reverse mapping', () => {
    const resultKeys = ['prod_hash_abc', 'east_sum("rev")'];
    const resolvedRowCols = new Set(['prod_hash_abc']);
    const resolvedPivotCols = ['region'];
    const aggInfo = [{ aggFunc: 'SUM', displayName: 'Revenue' }];
    const reverseMapping = { prod_hash_abc: 'Product' };

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, reverseMapping);

    expect(result[0].displayName).toBe('Product');
    expect(result[0].meta.isPivotRow).toBe(true);
  });

  it('returns only row columns when no pivot columns exist', () => {
    const resultKeys = ['product', 'category'];
    const resolvedRowCols = new Set(['product', 'category']);
    const resolvedPivotCols = ['region'];
    const aggInfo = [{ aggFunc: 'SUM', displayName: 'Revenue' }];

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, {});

    expect(result).toHaveLength(2);
    expect(result.every(c => c.meta.isPivotRow)).toBe(true);
  });

  it('handles single value where DuckDB omits agg suffix', () => {
    const resultKeys = ['product', 'east', 'west'];
    const resolvedRowCols = new Set(['product']);
    const resolvedPivotCols = ['region'];
    const aggInfo = [{ aggFunc: 'SUM', displayName: 'Revenue' }];

    const result = parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, {});

    expect(result).toHaveLength(3);
    expect(result[1].displayName).toBe('East');
    expect(result[2].displayName).toBe('West');
  });
});
