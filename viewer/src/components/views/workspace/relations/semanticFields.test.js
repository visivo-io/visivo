/* eslint-disable no-template-curly-in-string */
import { groupFieldsByModel } from './semanticFields';

describe('groupFieldsByModel', () => {
  it('groups inline model metrics + dimensions by model name', () => {
    const models = [
      {
        name: 'orders',
        config: {
          metrics: [{ name: 'total', expression: 'SUM(amount)' }],
          dimensions: [{ name: 'status', expression: 'status' }],
        },
      },
      {
        name: 'users',
        config: { metrics: [{ name: 'count', expression: 'COUNT(*)' }] },
      },
    ];

    const grouped = groupFieldsByModel(models, [], []);
    expect(grouped.orders).toEqual({ metrics: ['total'], dimensions: ['status'] });
    expect(grouped.users).toEqual({ metrics: ['count'], dimensions: [] });
  });

  it('attributes top-level fields to their parentModel owner', () => {
    const models = [{ name: 'orders', config: {} }];
    const metrics = [{ name: 'revenue', parentModel: 'orders', config: { expression: 'SUM(x)' } }];
    const dimensions = [
      { name: 'region', config: { model: '${ref(orders)}', expression: 'region' } },
    ];

    const grouped = groupFieldsByModel(models, metrics, dimensions);
    expect(grouped.orders.metrics).toContain('revenue');
    expect(grouped.orders.dimensions).toContain('region');
  });

  it('de-dupes a field that appears both inline and top-level', () => {
    const models = [
      { name: 'orders', config: { metrics: [{ name: 'total', expression: 'SUM(x)' }] } },
    ];
    const metrics = [{ name: 'total', parentModel: 'orders', config: { expression: 'SUM(x)' } }];

    const grouped = groupFieldsByModel(models, metrics, []);
    expect(grouped.orders.metrics).toEqual(['total']);
  });

  it('skips top-level fields with no resolvable single owner', () => {
    const metrics = [
      { name: 'composite', config: { expression: '${ref(a).x} + ${ref(b).y}' } },
    ];
    const grouped = groupFieldsByModel([], metrics, []);
    // No parentModel / config.model → not attributed to any card.
    expect(Object.keys(grouped)).toHaveLength(0);
  });

  it('sorts field names for stable rendering', () => {
    const models = [
      {
        name: 'orders',
        config: {
          metrics: [{ name: 'zeta' }, { name: 'alpha' }],
        },
      },
    ];
    const grouped = groupFieldsByModel(models, [], []);
    expect(grouped.orders.metrics).toEqual(['alpha', 'zeta']);
  });
});
