import { fieldExpression, fieldFormat, withFormat } from './tableFields';

describe('tableFields', () => {
  it('reads the expression of a plain and a formatted entry', () => {
    expect(fieldExpression('sum(x)')).toBe('sum(x)');
    expect(fieldExpression({ value: 'sum(x)', format: ',d' })).toBe('sum(x)');
    expect(fieldExpression(null)).toBeNull();
  });

  it('reads the format of a formatted entry only', () => {
    expect(fieldFormat({ value: 'x', format: '$,.0f' })).toBe('$,.0f');
    expect(fieldFormat({ value: 'x', format: '' })).toBeUndefined();
    expect(fieldFormat('x')).toBeUndefined();
    expect(fieldFormat(null)).toBeUndefined();
  });

  it('builds a formatted entry only when there is a format', () => {
    expect(withFormat('x', '.1%')).toEqual({ value: 'x', format: '.1%' });
    expect(withFormat('x', '')).toBe('x');
    expect(withFormat('x', undefined)).toBe('x');
  });
});
