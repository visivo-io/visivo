/* eslint-disable no-template-curly-in-string */
import { resolveFieldRef, resolveValueExpression, extractAggAndColumn } from './pivotRefResolver';

describe('resolveFieldRef', () => {
  const propsMapping = {
    'props.region': 'region_hash_abc',
    'props.revenue': 'revenue_hash_xyz',
    'props.product': 'product_hash_123',
  };

  it('resolves a ref to its hashed column name', () => {
    expect(resolveFieldRef('${ref(sales-insight).region}', propsMapping)).toBe('region_hash_abc');
  });

  it('resolves ref with extra whitespace', () => {
    expect(resolveFieldRef('${ ref( sales-insight ).revenue }', propsMapping)).toBe(
      'revenue_hash_xyz'
    );
  });

  it('falls back to field name when not in props_mapping', () => {
    expect(resolveFieldRef('${ref(insight).unknown_field}', propsMapping)).toBe('unknown_field');
  });

  it('returns input as-is for non-ref strings', () => {
    expect(resolveFieldRef('plain_string', propsMapping)).toBe('plain_string');
  });

  it('handles null props_mapping', () => {
    expect(resolveFieldRef('${ref(insight).field}', null)).toBe('field');
  });
});

describe('resolveValueExpression', () => {
  const propsMapping = {
    'props.revenue': 'revenue_hash_xyz',
    'props.quantity': 'qty_hash_abc',
  };

  it('resolves a simple aggregation expression', () => {
    const result = resolveValueExpression('sum(${ref(insight).revenue})', propsMapping);
    expect(result).toBe('sum("revenue_hash_xyz")');
  });

  it('resolves multiple refs in one expression', () => {
    const result = resolveValueExpression(
      '${ref(insight).revenue} + ${ref(insight).quantity}',
      propsMapping
    );
    expect(result).toBe('"revenue_hash_xyz" + "qty_hash_abc"');
  });

  it('falls back for unknown fields', () => {
    const result = resolveValueExpression('sum(${ref(insight).unknown})', propsMapping);
    expect(result).toBe('sum("unknown")');
  });
});

describe('extractAggAndColumn', () => {
  it('extracts function and column', () => {
    expect(extractAggAndColumn('sum("revenue_hash")')).toEqual({
      aggFunc: 'sum',
      column: '"revenue_hash"',
    });
  });

  it('handles avg', () => {
    expect(extractAggAndColumn('avg("col")')).toEqual({
      aggFunc: 'avg',
      column: '"col"',
    });
  });

  it('returns null for non-function expressions', () => {
    expect(extractAggAndColumn('"just_a_column"')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractAggAndColumn('')).toBeNull();
  });
});
