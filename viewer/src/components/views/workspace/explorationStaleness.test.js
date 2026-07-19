/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { computeExplorationStaleness } from './explorationStaleness';

const baseState = {
  models: [{ name: 'orders_q' }],
  metrics: [{ name: 'revenue' }],
  dimensions: [{ name: 'region' }],
  sources: [{ name: 'warehouse' }],
  insights: [],
  charts: [],
  tables: [],
  markdowns: [],
  inputs: [],
  relations: [],
  dashboards: [],
};

describe('computeExplorationStaleness', () => {
  it('is not stale for a draft with no dangling refs', () => {
    const exploration = {
      draft: {
        queries: [{ name: 'orders_q', sql: 'SELECT * FROM t', source: 'warehouse' }],
        insights: [
          { name: 'ins', props: { x: '?{${ref(orders_q).region}}', y: '?{${ref(revenue)}}' } },
        ],
      },
    };
    expect(computeExplorationStaleness(exploration, baseState)).toEqual({
      stale: false,
      danglingRefs: [],
    });
  });

  it('flags a ref whose target no longer exists in any collection', () => {
    const exploration = {
      draft: {
        queries: [{ name: 'q1', sql: 'SELECT 1', source: 'warehouse' }],
        insights: [{ name: 'ins', props: { x: '?{${ref(deleted_model).col}}' } }],
      },
    };
    const result = computeExplorationStaleness(exploration, baseState);
    expect(result.stale).toBe(true);
    expect(result.danglingRefs).toEqual(['deleted_model']);
  });

  it('never flags a ref to the draft\'s OWN not-yet-promoted scratch query', () => {
    const exploration = {
      draft: {
        queries: [{ name: 'scratch_q', sql: 'SELECT 1', source: 'warehouse' }],
        insights: [{ name: 'ins', props: { x: '?{${ref(scratch_q).col}}' } }],
      },
    };
    expect(computeExplorationStaleness(exploration, baseState).stale).toBe(false);
  });

  it('dedupes repeated dangling refs across multiple insights', () => {
    const exploration = {
      draft: {
        queries: [],
        insights: [
          { name: 'a', props: { x: '?{${ref(gone).col}}' } },
          { name: 'b', props: { y: '?{${ref(gone).col2}}' } },
        ],
      },
    };
    const result = computeExplorationStaleness(exploration, baseState);
    expect(result.danglingRefs).toEqual(['gone']);
  });

  it('is not stale for a missing/empty draft', () => {
    expect(computeExplorationStaleness(null, baseState)).toEqual({ stale: false, danglingRefs: [] });
    expect(computeExplorationStaleness({}, baseState)).toEqual({ stale: false, danglingRefs: [] });
  });

  it('fails open (never stale) when no collection is populated at all', () => {
    const exploration = {
      draft: { queries: [], insights: [{ name: 'ins', props: { x: '?{${ref(anything).col}}' } }] },
    };
    expect(computeExplorationStaleness(exploration, {}).stale).toBe(false);
  });
});
