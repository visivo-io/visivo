/* eslint-disable no-template-curly-in-string */
import { buildPivotQuery, buildColumnSelectQuery } from './pivotQueryBuilder';

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
