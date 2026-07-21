import { isGenericPromoteName, suggestPromoteNames } from './promoteNaming';

describe('isGenericPromoteName', () => {
  test.each([
    ['model', 'query_1', true],
    ['model', 'query_23', true],
    ['model', 'model', true],
    ['model', 'orders_q', false],
    ['insight', 'insight', true],
    ['insight', 'insight_2', true],
    ['insight', 'churn_by_cohort', false],
    ['chart', 'chart', true],
    ['chart', 'chart_2', true],
    ['chart', 'churn_chart', false],
    ['metric', 'query_1', false], // fields are never "generic" here
  ])('%s / %s -> %s', (type, name, expected) => {
    expect(isGenericPromoteName(type, name)).toBe(expected);
  });
});

describe('suggestPromoteNames', () => {
  const row = (overrides = {}) => ({
    tier: 'model',
    type: 'model',
    name: 'query_1',
    status: 'new',
    ...overrides,
  });

  test('suggests <source>_query for a generically-named new model bound to a source', () => {
    const rows = [row({ name: 'query_1' })];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.get('model:query_1')).toBe('orders_query');
  });

  test('leaves a model with no bound source unsuggested (still editable, never guessed)', () => {
    const rows = [row({ name: 'query_1' })];
    const suggestions = suggestPromoteNames(rows, () => null, []);
    expect(suggestions.has('model:query_1')).toBe(false);
  });

  test('never touches an already-meaningful name', () => {
    const rows = [row({ name: 'orders_q' })];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.size).toBe(0);
  });

  test('never touches a "modified" (update-by-name) row, even if generic-looking', () => {
    const rows = [row({ name: 'query_1', status: 'modified' })];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.size).toBe(0);
  });

  test('never suggests a name for a field row', () => {
    const rows = [row({ tier: 'field', type: 'metric', name: 'query_1' })];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.size).toBe(0);
  });

  test('cascades model -> insight -> chart into one coherent family', () => {
    const rows = [
      row({ tier: 'model', type: 'model', name: 'query_1' }),
      row({ tier: 'insight', type: 'insight', name: 'insight' }),
      row({ tier: 'chart', type: 'chart', name: 'chart' }),
    ];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.get('model:query_1')).toBe('orders_query');
    expect(suggestions.get('insight:insight')).toBe('orders_query_insight');
    expect(suggestions.get('chart:chart')).toBe('orders_query_insight_chart');
  });

  test('chart anchors on the model when no insight anchor is available', () => {
    const rows = [
      row({ tier: 'model', type: 'model', name: 'query_1' }),
      row({ tier: 'chart', type: 'chart', name: 'chart' }),
    ];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.get('chart:chart')).toBe('orders_query_chart');
  });

  test('avoids colliding with a known existing name by suffixing', () => {
    const rows = [row({ name: 'query_1' })];
    const suggestions = suggestPromoteNames(rows, () => 'orders', ['orders_query']);
    expect(suggestions.get('model:query_1')).toBe('orders_query_2');
  });

  test('an already-meaningful model still anchors a generic insight/chart', () => {
    const rows = [
      row({ tier: 'model', type: 'model', name: 'orders_q' }),
      row({ tier: 'insight', type: 'insight', name: 'insight' }),
    ];
    const suggestions = suggestPromoteNames(rows, () => null, []);
    expect(suggestions.get('insight:insight')).toBe('orders_q_insight');
  });

  test('returns an empty map for an empty checklist', () => {
    expect(suggestPromoteNames([], () => null, []).size).toBe(0);
  });

  test('fails safe on an undefined/null rows argument (never throws)', () => {
    expect(suggestPromoteNames(undefined, () => 'orders', []).size).toBe(0);
    expect(suggestPromoteNames(null, () => 'orders', []).size).toBe(0);
  });

  test('fails safe when no getModelSourceName callback is supplied at all', () => {
    const rows = [row({ name: 'query_1' })];
    const suggestions = suggestPromoteNames(rows, undefined, []);
    expect(suggestions.has('model:query_1')).toBe(false);
  });

  test('a generic chart with neither an insight NOR a model anchor is left unsuggested', () => {
    const rows = [row({ tier: 'chart', type: 'chart', name: 'chart' })];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.size).toBe(0);
  });

  test('a lone generic insight row with no model anchor at all is left unsuggested', () => {
    const rows = [row({ tier: 'insight', type: 'insight', name: 'insight' })];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.size).toBe(0);
  });

  // Even an insight that itself stayed unsuggested (no model anchor) still
  // becomes the NEXT row's anchor candidate — cascading uses whatever name
  // is on hand, generic or not, rather than leaving the chart anchor-less
  // when an earlier row already had none itself.
  test('an unsuggested (still-generic) insight still anchors a later generic chart', () => {
    const rows = [
      row({ tier: 'insight', type: 'insight', name: 'insight' }),
      row({ tier: 'chart', type: 'chart', name: 'chart' }),
    ];
    const suggestions = suggestPromoteNames(rows, () => 'orders', []);
    expect(suggestions.has('insight:insight')).toBe(false);
    expect(suggestions.get('chart:chart')).toBe('insight_chart');
  });

  test('isGenericPromoteName never throws on a nullish name', () => {
    expect(isGenericPromoteName('model', undefined)).toBe(false);
    expect(isGenericPromoteName('model', null)).toBe(false);
  });
});
