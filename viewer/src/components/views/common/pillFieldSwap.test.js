/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import {
  findReclassifiedSlots,
  findMatchingExpressionSlots,
  serializeSwapTarget,
  readCurrentSlotState,
} from './pillFieldSwap';

describe('pillFieldSwap', () => {
  describe('findReclassifiedSlots (delta-review fix: promote-time silent reclassification)', () => {
    test('finds a bare-column pill whose column name collides with a just-promoted Dimension name, regardless of the stated model', () => {
      const insightStates = {
        churn_by_cohort: {
          props: { x: '?{${ref(orders_q).region}}', y: '?{sum(${ref(orders_q).amount})}' },
          interactions: [],
        },
        // A DIFFERENT model entirely — global-name-first means this is
        // ALSO at risk, even though it never touched `orders_q`.
        other_insight: {
          props: { x: '?{${ref(events_q).region}}' },
          interactions: [],
        },
      };
      const hits = findReclassifiedSlots('region', 'dimension', insightStates);
      expect(hits).toHaveLength(2);
      const names = hits.map(h => h.insightName).sort();
      expect(names).toEqual(['churn_by_cohort', 'other_insight']);
      expect(hits[0].swapTo).toEqual({ kind: 'dimensionRef', ref: 'region' });
    });

    test('a promoted METRIC name produces a metricRef swap target', () => {
      const insightStates = {
        a: { props: { y: '?{${ref(orders_q).revenue}}' }, interactions: [] },
      };
      const hits = findReclassifiedSlots('revenue', 'metric', insightStates);
      expect(hits).toHaveLength(1);
      expect(hits[0].swapTo).toEqual({ kind: 'metricRef', ref: 'revenue' });
    });

    test('does not flag slots whose column name does not match', () => {
      const insightStates = {
        a: { props: { x: '?{${ref(orders_q).cohort}}' }, interactions: [] },
      };
      expect(findReclassifiedSlots('region', 'dimension', insightStates)).toHaveLength(0);
    });

    test('an aggregate-wrapped column ref colliding with a promoted name is ALSO caught (would collapse to opaque, not reclassify — still worth flagging)', () => {
      const insightStates = {
        a: { props: { y: '?{sum(${ref(orders_q).amount})}' }, interactions: [] },
      };
      const hits = findReclassifiedSlots('amount', 'metric', insightStates);
      expect(hits).toHaveLength(1);
      expect(hits[0].previousAgg).toBe('sum');
    });

    test('interaction values are scanned too', () => {
      const insightStates = {
        a: {
          props: {},
          interactions: [{ type: 'filter', value: '?{${ref(orders_q).region} = \'west\'}' }],
        },
      };
      // Not a clean single-ref shape (has a trailing comparison) — this
      // exercises the "doesn't match, no false positive" path along with a
      // clean one below.
      expect(findReclassifiedSlots('region', 'dimension', insightStates)).toHaveLength(0);

      const cleanInteraction = {
        a: { props: {}, interactions: [{ type: 'sort', value: '?{${ref(orders_q).region}}' }] },
      };
      const hits = findReclassifiedSlots('region', 'dimension', cleanInteraction);
      expect(hits).toHaveLength(1);
      expect(hits[0].location).toBe('interaction');
      expect(hits[0].key).toBe(0);
    });
  });

  describe('findMatchingExpressionSlots (06 §8 match-and-replace dedup)', () => {
    test('finds other slots with the IDENTICAL ref+column+agg shape, excluding the just-promoted slot itself', () => {
      const insightStates = {
        churn_by_cohort: {
          props: {
            y: '?{sum(${ref(orders_q).amount})}',
            y2: '?{sum(${ref(orders_q).amount})}',
          },
          interactions: [],
        },
        other_chart: {
          props: { y: '?{sum(${ref(orders_q).amount})}' },
          interactions: [],
        },
      };
      const hits = findMatchingExpressionSlots(
        {
          promotedRef: 'orders_q',
          promotedColumn: 'amount',
          promotedAgg: 'sum',
          promotedName: 'total_amount',
          promotedType: 'metric',
        },
        insightStates,
        { excludeInsightName: 'churn_by_cohort', excludeLocation: 'prop', excludeKey: 'y' }
      );
      expect(hits).toHaveLength(2);
      expect(hits.map(h => `${h.insightName}:${h.key}`).sort()).toEqual([
        'churn_by_cohort:y2',
        'other_chart:y',
      ]);
    });

    test('a different aggregation on the same column does not match', () => {
      const insightStates = {
        a: { props: { y: '?{avg(${ref(orders_q).amount})}' }, interactions: [] },
      };
      const hits = findMatchingExpressionSlots(
        { promotedRef: 'orders_q', promotedColumn: 'amount', promotedAgg: 'sum', promotedName: 'x', promotedType: 'metric' },
        insightStates
      );
      expect(hits).toHaveLength(0);
    });
  });

  describe('both detectors capture previousColumn (VIS-1095 accept-time re-validation)', () => {
    test('findReclassifiedSlots', () => {
      const insightStates = { a: { props: { y: '?{${ref(orders_q).region}}' }, interactions: [] } };
      const hits = findReclassifiedSlots('region', 'dimension', insightStates);
      expect(hits[0]).toMatchObject({ previousRef: 'orders_q', previousColumn: 'region', previousAgg: null });
    });

    test('findMatchingExpressionSlots', () => {
      const insightStates = { a: { props: { y: '?{sum(${ref(orders_q).amount})}' }, interactions: [] } };
      const hits = findMatchingExpressionSlots(
        { promotedRef: 'orders_q', promotedColumn: 'amount', promotedAgg: 'sum', promotedName: 'x', promotedType: 'metric' },
        insightStates
      );
      expect(hits[0]).toMatchObject({ previousRef: 'orders_q', previousColumn: 'amount', previousAgg: 'sum' });
    });
  });

  describe('readCurrentSlotState (VIS-1095 accept-time re-validation)', () => {
    test('reads and parses the CURRENT prop value at the slot key', () => {
      const insightStates = {
        a: { props: { y: '?{${ref(orders_q).region}}' }, interactions: [] },
      };
      const state = readCurrentSlotState(insightStates, { insightName: 'a', location: 'prop', key: 'y' });
      expect(state).toMatchObject({ kind: 'dimension', ref: 'orders_q', column: 'region' });
    });

    test('reads and parses the CURRENT interaction value at the slot index', () => {
      const insightStates = {
        a: { props: {}, interactions: [{ type: 'sort', value: '?{sum(${ref(orders_q).amount})}' }] },
      };
      const state = readCurrentSlotState(insightStates, { insightName: 'a', location: 'interaction', key: 0 });
      expect(state).toMatchObject({ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
    });

    test('returns null when the insight no longer exists (renamed/removed since the offer was made)', () => {
      const state = readCurrentSlotState({}, { insightName: 'gone', location: 'prop', key: 'y' });
      expect(state).toBeNull();
    });

    test('returns null when the current value no longer parses as a column-ref shape', () => {
      const insightStates = { a: { props: { y: 'not a ref at all' }, interactions: [] } };
      const state = readCurrentSlotState(insightStates, { insightName: 'a', location: 'prop', key: 'y' });
      expect(state).toBeNull();
    });
  });

  describe('serializeSwapTarget', () => {
    test('serializes a metricRef swap target to a query-string ref', () => {
      expect(serializeSwapTarget({ kind: 'metricRef', ref: 'total_amount' })).toBe(
        '?{${ref(total_amount)}}'
      );
    });

    test('serializes a dimensionRef swap target', () => {
      expect(serializeSwapTarget({ kind: 'dimensionRef', ref: 'region' })).toBe(
        '?{${ref(region)}}'
      );
    });
  });
});
