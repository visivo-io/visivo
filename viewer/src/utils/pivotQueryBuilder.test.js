/* eslint-disable no-template-curly-in-string */
import { buildPivotQuery, buildColumnSelectQuery, sourceRelation } from './pivotQueryBuilder';

describe('buildPivotQuery', () => {
  const propsMapping = {
    'props.region': 'region_hash_abc',
    'props.product': 'product_hash_123',
    'props.revenue': 'revenue_hash_xyz',
  };

  it('builds a valid PIVOT query', () => {
    const sql = buildPivotQuery(
      {
        columns: ['${ref(insight).region}'],
        rows: ['${ref(insight).product}'],
        values: ['sum(${ref(insight).revenue})'],
      },
      propsMapping,
      'my_table_hash'
    );

    expect(sql).toBe(
      'PIVOT (SELECT * FROM "my_table_hash") ON "region_hash_abc" USING sum("revenue_hash_xyz") GROUP BY "product_hash_123"'
    );
  });

  it('builds a single-aggregated-row pivot when there are NO rows', () => {
    // Columns + values but no rows: omit GROUP BY and restrict the inner SELECT
    // to the pivot + value columns so DuckDB collapses to one aggregated row
    // (a SELECT * would implicitly group by every other column).
    const sql = buildPivotQuery(
      {
        columns: ['${ref(insight).region}'],
        rows: [],
        values: ['sum(${ref(insight).revenue})', 'count(${ref(insight).revenue})'],
      },
      propsMapping,
      'tbl'
    );
    expect(sql).toBe(
      'PIVOT (SELECT "region_hash_abc", "revenue_hash_xyz" FROM "tbl") ' +
        'ON "region_hash_abc" USING sum("revenue_hash_xyz"), count("revenue_hash_xyz")'
    );
    // No trailing GROUP BY for the no-rows case.
    expect(sql).not.toMatch(/GROUP BY/);
  });

  it('handles multiple row fields', () => {
    const sql = buildPivotQuery(
      {
        columns: ['${ref(insight).region}'],
        rows: ['${ref(insight).product}', '${ref(insight).region}'],
        values: ['sum(${ref(insight).revenue})'],
      },
      propsMapping,
      'tbl'
    );

    expect(sql).toContain('GROUP BY "product_hash_123", "region_hash_abc"');
  });

  it('handles multiple value expressions', () => {
    const sql = buildPivotQuery(
      {
        columns: ['${ref(insight).region}'],
        rows: ['${ref(insight).product}'],
        values: ['sum(${ref(insight).revenue})', 'avg(${ref(insight).revenue})'],
      },
      propsMapping,
      'tbl'
    );

    expect(sql).toContain('USING sum("revenue_hash_xyz"), avg("revenue_hash_xyz")');
  });

  it('throws for invalid value expression', () => {
    expect(() =>
      buildPivotQuery(
        {
          columns: ['${ref(insight).region}'],
          rows: ['${ref(insight).product}'],
          values: ['just_a_field'],
        },
        propsMapping,
        'tbl'
      )
    ).toThrow('Invalid value expression');
  });

  it('excludes count(*) from the no-rows inner SELECT but keeps it in USING', () => {
    const sql = buildPivotQuery(
      {
        columns: ['${ref(insight).region}'],
        rows: [],
        values: ['count(*)', 'sum(${ref(insight).revenue})'],
      },
      propsMapping,
      'tbl'
    );

    expect(sql).toBe(
      'PIVOT (SELECT "region_hash_abc", "revenue_hash_xyz" FROM "tbl") ' +
        'ON "region_hash_abc" USING count(*), sum("revenue_hash_xyz")'
    );
  });

  it('falls back to the raw field name when a ref is missing from props_mapping', () => {
    const sql = buildPivotQuery(
      {
        columns: ['${ref(insight).unmapped_col}'],
        rows: ['${ref(insight).product}'],
        values: ['sum(${ref(insight).unmapped_val})'],
      },
      propsMapping,
      'tbl'
    );

    expect(sql).toBe(
      'PIVOT (SELECT * FROM "tbl") ON "unmapped_col" USING sum("unmapped_val") GROUP BY "product_hash_123"'
    );
  });

  it('treats missing rows key the same as empty rows', () => {
    const sql = buildPivotQuery(
      {
        columns: ['${ref(insight).region}'],
        values: ['sum(${ref(insight).revenue})'],
      },
      propsMapping,
      'tbl'
    );

    expect(sql).not.toMatch(/GROUP BY/);
  });
});

describe('buildColumnSelectQuery', () => {
  const propsMapping = {
    'props.region': 'region_hash_abc',
    'props.revenue': 'revenue_hash_xyz',
  };

  it('selects resolved columns without aliases', () => {
    const sql = buildColumnSelectQuery(['${ref(insight).region}'], propsMapping, 'tbl');
    expect(sql).toBe('SELECT "region_hash_abc" FROM "tbl"');
  });

  it('applies "as" aliases with quoting', () => {
    const sql = buildColumnSelectQuery(
      ['${ref(insight).revenue} as Total Revenue'],
      propsMapping,
      'tbl'
    );
    expect(sql).toBe('SELECT "revenue_hash_xyz" AS "Total Revenue" FROM "tbl"');
  });

  // Smoke-test bug #4: the documented quoted-alias syntax (`as "Total Revenue"`,
  // per the Table docstring) must NOT double-wrap the alias into
  // `AS ""Total Revenue""` (a zero-length delimited identifier that breaks the
  // whole table in DuckDB-WASM). The caller owns the SQL quoting; the user's
  // quotes are stripped first.
  it('does not double-wrap a documented quoted alias', () => {
    const sql = buildColumnSelectQuery(
      ['${ref(insight).revenue} as "Total Revenue"'],
      propsMapping,
      'tbl'
    );
    expect(sql).toBe('SELECT "revenue_hash_xyz" AS "Total Revenue" FROM "tbl"');
    expect(sql).not.toContain('""');
  });

  it('strips single-quoted aliases the same way', () => {
    const sql = buildColumnSelectQuery(["${ref(insight).region} as 'Sales Region'"], propsMapping, 'tbl');
    expect(sql).toBe('SELECT "region_hash_abc" AS "Sales Region" FROM "tbl"');
  });

  // An empty quoted alias (`as ""`) reduces to no alias — a graceful, valid
  // result, NOT the zero-length-identifier `AS ""` the bug produced.
  it('drops an empty quoted alias instead of emitting a zero-length identifier', () => {
    const sql = buildColumnSelectQuery(['${ref(insight).region} as ""'], propsMapping, 'tbl');
    expect(sql).toBe('SELECT "region_hash_abc" FROM "tbl"');
    expect(sql).not.toContain('""');
  });

  it('handles multiple columns with mixed aliasing', () => {
    const sql = buildColumnSelectQuery(
      ['${ref(insight).region}', '${ref(insight).revenue} AS Amount'],
      propsMapping,
      'tbl'
    );
    expect(sql).toBe('SELECT "region_hash_abc", "revenue_hash_xyz" AS "Amount" FROM "tbl"');
  });

  it('falls back to the raw field name with a null propsMapping (model tables)', () => {
    const sql = buildColumnSelectQuery(['${ref(model).region} as Region'], null, 'model_tbl');
    expect(sql).toBe('SELECT "region" AS "Region" FROM "model_tbl"');
  });

  it('passes through plain (non-ref) column names', () => {
    const sql = buildColumnSelectQuery(['region'], null, 'model_tbl');
    expect(sql).toBe('SELECT "region" FROM "model_tbl"');
  });
});

// VIS-1462 T1: with a prepared post-query the table reads the SAME input-filtered
// result set the chart renders (a derived table), not the raw parquet.
describe('sourceSql relation (VIS-1462 T1)', () => {
  const propsMapping = { 'props.region': 'r_hash', 'props.revenue': 'v_hash' };
  const postQuery = 'SELECT "t"."region" AS "r_hash", "t"."revenue" AS "v_hash" FROM "t" WHERE "t"."x" > 3';

  it('sourceRelation quotes the table name without sourceSql', () => {
    expect(sourceRelation('tbl', null)).toBe('"tbl"');
    expect(sourceRelation('tbl', undefined)).toBe('"tbl"');
    expect(sourceRelation('tbl', '')).toBe('"tbl"');
  });

  it('sourceRelation wraps sourceSql as an aliased derived table', () => {
    expect(sourceRelation('tbl', 'SELECT 1')).toBe('(SELECT 1) AS "__visivo_source"');
  });

  it('column-select reads FROM the derived table', () => {
    const sql = buildColumnSelectQuery(['${ref(i).region}'], propsMapping, 'tbl', postQuery);
    expect(sql).toBe(`SELECT "r_hash" FROM (${postQuery}) AS "__visivo_source"`);
  });

  it('pivot with rows reads FROM the derived table', () => {
    const sql = buildPivotQuery(
      { columns: ['${ref(i).region}'], rows: ['${ref(i).region}'], values: ['sum(${ref(i).revenue})'] },
      propsMapping,
      'tbl',
      postQuery
    );
    expect(sql).toBe(
      `PIVOT (SELECT * FROM (${postQuery}) AS "__visivo_source") ON "r_hash" USING sum("v_hash") GROUP BY "r_hash"`
    );
  });

  it('pivot without rows reads FROM the derived table', () => {
    const sql = buildPivotQuery(
      { columns: ['${ref(i).region}'], rows: [], values: ['sum(${ref(i).revenue})'] },
      propsMapping,
      'tbl',
      postQuery
    );
    expect(sql).toBe(
      `PIVOT (SELECT "r_hash", "v_hash" FROM (${postQuery}) AS "__visivo_source") ON "r_hash" USING sum("v_hash")`
    );
  });
});
