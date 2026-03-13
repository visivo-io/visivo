/* eslint-disable no-template-curly-in-string */
import { buildPivotQuery } from './pivotQueryBuilder';

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
});
