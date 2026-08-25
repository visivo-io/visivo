import { generateUniqueName, suffixSeparatorFor } from './uniqueName';

describe('generateUniqueName', () => {
  it('returns prefix if not taken', () => {
    expect(generateUniqueName('model', new Set())).toBe('model');
  });

  it('returns prefix if not in array', () => {
    expect(generateUniqueName('model', ['other'])).toBe('model');
  });

  it('returns prefix if not in object keys', () => {
    expect(generateUniqueName('model', { other: {} })).toBe('model');
  });

  it('handles null/undefined existingNames', () => {
    expect(generateUniqueName('model', null)).toBe('model');
    expect(generateUniqueName('model', undefined)).toBe('model');
  });
});

// The house style for generated object names is hyphens, so the collision
// suffix is a hyphen too. This used to be hard-coded to `_`, which meant every
// generated name mixed both conventions the moment it collided.
describe('generateUniqueName — suffix separator', () => {
  it('appends -2 when a separator-less prefix is taken', () => {
    expect(generateUniqueName('model', new Set(['model']))).toBe('model-2');
  });

  it('counts up past taken suffixes', () => {
    expect(generateUniqueName('model', new Set(['model', 'model-2']))).toBe('model-3');
    const many = new Set(['m', 'm-2', 'm-3', 'm-4', 'm-5']);
    expect(generateUniqueName('m', many)).toBe('m-6');
  });

  it('keeps a hyphenated base hyphenated', () => {
    expect(generateUniqueName('orders-query', new Set(['orders-query']))).toBe('orders-query-2');
  });

  it('keeps an underscored base underscored — `a_to_b-2` would read wrong', () => {
    expect(generateUniqueName('orders_to_users', new Set(['orders_to_users']))).toBe(
      'orders_to_users_2'
    );
  });

  it('prefers the hyphen when a base mixes both', () => {
    expect(generateUniqueName('orders_db-query', new Set(['orders_db-query']))).toBe(
      'orders_db-query-2'
    );
  });

  it('honours an explicit separator over the inferred one', () => {
    // dimension/metric MUST stay SQL identifiers — the backend rejects
    // `region-2`. A user-named dimension carries no separator to infer from,
    // so the call site declares it.
    expect(generateUniqueName('region', new Set(['region']), { separator: '_' })).toBe('region_2');
    expect(generateUniqueName('a-b', new Set(['a-b']), { separator: '_' })).toBe('a-b_2');
  });

  it('does not treat the other convention as taken', () => {
    // A project can hold names minted before and after this change; `chart_2`
    // does not block `chart-2`.
    expect(generateUniqueName('chart', new Set(['chart', 'chart_2']))).toBe('chart-2');
  });
});

describe('suffixSeparatorFor', () => {
  it.each([
    ['chart', '-'],
    ['new-chart', '-'],
    ['new_dimension', '_'],
    ['orders_db-query', '-'],
    ['', '-'],
  ])('%s → %s', (prefix, expected) => {
    expect(suffixSeparatorFor(prefix)).toBe(expected);
  });

  it('tolerates a null/undefined prefix', () => {
    expect(suffixSeparatorFor(null)).toBe('-');
    expect(suffixSeparatorFor(undefined)).toBe('-');
  });
});
