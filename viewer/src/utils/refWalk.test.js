/* eslint-disable no-template-curly-in-string -- test fixtures are literal Visivo ref-string syntax, not JS template interpolation */
import { collectRefNames, collectInsightRefNames, countReferencingInsights } from './refWalk';

describe('collectRefNames', () => {
  test('finds a bare ref() in a string', () => {
    expect(collectRefNames('${ref(orders_q)}')).toEqual(new Set(['orders_q']));
  });

  test('finds a ref().field in a string', () => {
    expect(collectRefNames('?{${ref(orders_q).amount}}')).toEqual(new Set(['orders_q']));
  });

  test('finds a ref() nested inside a function call expression', () => {
    expect(collectRefNames('sum(ref(orders_q).amount)')).toEqual(new Set(['orders_q']));
  });

  test('finds multiple distinct refs across a string', () => {
    const names = collectRefNames('${ref(a).x} + ${ref(b).y}');
    expect(names).toEqual(new Set(['a', 'b']));
  });

  test('walks nested objects and arrays', () => {
    const value = {
      x: '${ref(model_a).col}',
      nested: { y: '${ref(model_b).col}' },
      list: ['${ref(model_c)}', 42, null],
    };
    expect(collectRefNames(value)).toEqual(new Set(['model_a', 'model_b', 'model_c']));
  });

  test('returns an empty set for a value with no refs', () => {
    expect(collectRefNames('plain text')).toEqual(new Set());
    expect(collectRefNames(null)).toEqual(new Set());
    expect(collectRefNames(undefined)).toEqual(new Set());
    expect(collectRefNames(42)).toEqual(new Set());
  });

  test('accumulates into a passed-in Set across repeated calls', () => {
    const into = new Set(['seed']);
    collectRefNames('${ref(a)}', into);
    collectRefNames('${ref(b)}', into);
    expect(into).toEqual(new Set(['seed', 'a', 'b']));
  });

  test('does not leak regex lastIndex state across calls (repeat call finds matches again)', () => {
    // A stale `lastIndex` from a previous call on a LONGER string would cause
    // a subsequent call on a SHORTER string to miss matches near the start.
    collectRefNames('${ref(a)} ${ref(b)} ${ref(c)} ${ref(d)}');
    expect(collectRefNames('${ref(a)}')).toEqual(new Set(['a']));
  });
});

describe('collectInsightRefNames', () => {
  test('collects refs from both props and interactions', () => {
    const insightState = {
      props: { x: '${ref(orders_q).cohort}', y: '${ref(orders_q).churned}' },
      interactions: [{ value: '${ref(region_input).value}' }],
    };
    expect(collectInsightRefNames(insightState)).toEqual(
      new Set(['orders_q', 'region_input'])
    );
  });

  test('tolerates a null/undefined insight state', () => {
    expect(collectInsightRefNames(null)).toEqual(new Set());
    expect(collectInsightRefNames(undefined)).toEqual(new Set());
  });

  test('tolerates missing props/interactions', () => {
    expect(collectInsightRefNames({})).toEqual(new Set());
  });
});

describe('countReferencingInsights', () => {
  const insightStates = {
    churn_by_cohort: { props: { x: '${ref(orders_q).cohort}' }, interactions: [] },
    revenue_by_region: {
      props: { x: '${ref(orders_q).region}', y: '${ref(cohort_q).amount}' },
      interactions: [],
    },
    unrelated: { props: { x: '${ref(cohort_q).amount}' }, interactions: [] },
  };
  const insightNames = ['churn_by_cohort', 'revenue_by_region', 'unrelated'];

  test('counts how many named insights reference each name', () => {
    const counts = countReferencingInsights(['orders_q', 'cohort_q'], insightNames, insightStates);
    expect(counts.get('orders_q')).toBe(2);
    expect(counts.get('cohort_q')).toBe(2);
  });

  test('a name with zero referencing insights counts as 0, not absent', () => {
    const counts = countReferencingInsights(['never_referenced'], insightNames, insightStates);
    expect(counts.get('never_referenced')).toBe(0);
  });

  test('only counts insights actually in insightNames (chart-attached), not every insightState', () => {
    const counts = countReferencingInsights(['cohort_q'], ['unrelated'], insightStates);
    expect(counts.get('cohort_q')).toBe(1);
  });

  test('tolerates empty/undefined inputs', () => {
    expect(countReferencingInsights([], [], {}).size).toBe(0);
    expect(countReferencingInsights(['a'], undefined, undefined).get('a')).toBe(0);
  });
});
