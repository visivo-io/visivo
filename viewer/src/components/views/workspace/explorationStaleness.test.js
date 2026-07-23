/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { computeExplorationStaleness, computeSeedContentSignature } from './explorationStaleness';

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
      driftedFrom: null,
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
    expect(computeExplorationStaleness(null, baseState)).toEqual({
      stale: false,
      danglingRefs: [],
      driftedFrom: null,
    });
    expect(computeExplorationStaleness({}, baseState)).toEqual({
      stale: false,
      danglingRefs: [],
      driftedFrom: null,
    });
  });

  it('fails open (never stale) when no collection is populated at all', () => {
    const exploration = {
      draft: { queries: [], insights: [{ name: 'ins', props: { x: '?{${ref(anything).col}}' } }] },
    };
    expect(computeExplorationStaleness(exploration, {}).stale).toBe(false);
  });

  // Phase 6c-T1 (ux-audit.md existing-objects #8, ⚠ conflicts-with-e2e — "no
  // staleness indication after the underlying insight is edited elsewhere"):
  // a copy-until-promote exploration whose seeded-from object's CONTENT
  // changed (still resolves, just edited) must be flagged, distinctly from
  // the dangling-ref case above.
  describe('drift detection (seededFrom.contentSignature)', () => {
    const driftState = {
      ...baseState,
      insights: [{ name: 'aggregated_bar', config: { props: { type: 'bar' }, description: 'v2' } }],
    };

    it('is not stale when the seeded object still matches its recorded signature', () => {
      const signature = computeSeedContentSignature(
        { type: 'insight', name: 'aggregated_bar' },
        driftState
      );
      const exploration = {
        draft: { queries: [], insights: [] },
        seededFrom: { type: 'insight', name: 'aggregated_bar', contentSignature: signature },
      };
      const result = computeExplorationStaleness(exploration, driftState);
      expect(result.stale).toBe(false);
      expect(result.driftedFrom).toBeNull();
    });

    it('flags drift when the seeded insight was edited elsewhere since the copy was made', () => {
      const staleSignature = computeSeedContentSignature(
        { type: 'insight', name: 'aggregated_bar' },
        { ...driftState, insights: [{ name: 'aggregated_bar', config: { props: { type: 'bar' }, description: 'v1' } }] }
      );
      const exploration = {
        draft: { queries: [], insights: [] },
        seededFrom: { type: 'insight', name: 'aggregated_bar', contentSignature: staleSignature },
      };
      const result = computeExplorationStaleness(exploration, driftState);
      expect(result.stale).toBe(true);
      expect(result.driftedFrom).toEqual({ type: 'insight', name: 'aggregated_bar' });
    });

    it('flags drift for a seeded MODEL too, not just insights', () => {
      const modelState = {
        ...baseState,
        models: [{ name: 'orders_q', config: { sql: 'SELECT 1' } }],
      };
      const staleSignature = computeSeedContentSignature(
        { type: 'model', name: 'orders_q' },
        { ...modelState, models: [{ name: 'orders_q', config: { sql: 'SELECT 2' } }] }
      );
      const exploration = {
        draft: { queries: [], insights: [] },
        seededFrom: { type: 'model', name: 'orders_q', contentSignature: staleSignature },
      };
      const result = computeExplorationStaleness(exploration, modelState);
      expect(result.stale).toBe(true);
      expect(result.driftedFrom).toEqual({ type: 'model', name: 'orders_q' });
    });

    it('does not flag drift when the seeded object was deleted entirely (that is the dangling-ref case, not drift)', () => {
      const exploration = {
        draft: { queries: [], insights: [] },
        seededFrom: { type: 'insight', name: 'gone_insight', contentSignature: 'some-old-signature' },
      };
      const result = computeExplorationStaleness(exploration, driftState);
      expect(result.driftedFrom).toBeNull();
    });

    it('does not flag drift when no contentSignature was ever recorded (older/legacy explorations)', () => {
      const exploration = {
        draft: { queries: [], insights: [] },
        seededFrom: { type: 'insight', name: 'aggregated_bar' },
      };
      const result = computeExplorationStaleness(exploration, driftState);
      expect(result.driftedFrom).toBeNull();
      expect(result.stale).toBe(false);
    });

    it('dangling-ref staleness and drift staleness are additive, not mutually exclusive', () => {
      const staleSignature = computeSeedContentSignature(
        { type: 'insight', name: 'aggregated_bar' },
        { ...driftState, insights: [{ name: 'aggregated_bar', config: { description: 'v1' } }] }
      );
      const exploration = {
        draft: {
          queries: [],
          insights: [{ name: 'ins', props: { x: '?{${ref(deleted_model).col}}' } }],
        },
        seededFrom: { type: 'insight', name: 'aggregated_bar', contentSignature: staleSignature },
      };
      const result = computeExplorationStaleness(exploration, driftState);
      expect(result.stale).toBe(true);
      expect(result.danglingRefs).toEqual(['deleted_model']);
      expect(result.driftedFrom).toEqual({ type: 'insight', name: 'aggregated_bar' });
    });
  });
});

describe('computeSeedContentSignature', () => {
  it('returns null for a seed type with no meaningful content hash (source/table/metric/dimension)', () => {
    const state = { models: [], insights: [], charts: [] };
    expect(computeSeedContentSignature({ type: 'source', name: 'warehouse' }, state)).toBeNull();
    expect(computeSeedContentSignature({ type: 'table', name: 'orders' }, state)).toBeNull();
    expect(computeSeedContentSignature({ type: 'metric', name: 'revenue' }, state)).toBeNull();
  });

  it('returns null when the object cannot be found', () => {
    const state = { models: [], insights: [], charts: [] };
    expect(computeSeedContentSignature({ type: 'model', name: 'missing' }, state)).toBeNull();
  });

  it('returns null when the seed has a type but no name', () => {
    expect(computeSeedContentSignature({ type: 'model' }, { models: [] })).toBeNull();
  });

  it('returns null when the seed has a name but no type', () => {
    expect(computeSeedContentSignature({ name: 'm' }, { models: [] })).toBeNull();
  });

  it('returns null when the collection the seed type maps to is entirely absent from state', () => {
    // state has no `models` key at all (not even an empty array) — the
    // `state?.[collectionKey] || []` fallback must hold, never throw.
    expect(computeSeedContentSignature({ type: 'model', name: 'm' }, {})).toBeNull();
  });

  it('returns the same signature regardless of object key order (stable hashing)', () => {
    const stateA = { models: [{ name: 'm', config: { sql: 'SELECT 1', source: 's' } }] };
    const stateB = { models: [{ name: 'm', config: { source: 's', sql: 'SELECT 1' } }] };
    expect(computeSeedContentSignature({ type: 'model', name: 'm' }, stateA)).toBe(
      computeSeedContentSignature({ type: 'model', name: 'm' }, stateB)
    );
  });

  it('returns different signatures for genuinely different content', () => {
    const stateA = { models: [{ name: 'm', config: { sql: 'SELECT 1' } }] };
    const stateB = { models: [{ name: 'm', config: { sql: 'SELECT 2' } }] };
    expect(computeSeedContentSignature({ type: 'model', name: 'm' }, stateA)).not.toBe(
      computeSeedContentSignature({ type: 'model', name: 'm' }, stateB)
    );
  });

  // stableStringify recurses through arrays too, not just plain objects —
  // an array-valued config field (e.g. a list of columns/tags) must still
  // hash deterministically regardless of how it got built.
  it('hashes array-valued config fields deterministically (stableStringify array branch)', () => {
    const stateA = { models: [{ name: 'm', config: { sql: 'SELECT 1', tags: ['a', 'b'] } }] };
    const stateB = { models: [{ name: 'm', config: { sql: 'SELECT 1', tags: ['a', 'b'] } }] };
    const stateC = { models: [{ name: 'm', config: { sql: 'SELECT 1', tags: ['a', 'c'] } }] };
    const sigA = computeSeedContentSignature({ type: 'model', name: 'm' }, stateA);
    const sigB = computeSeedContentSignature({ type: 'model', name: 'm' }, stateB);
    const sigC = computeSeedContentSignature({ type: 'model', name: 'm' }, stateC);
    expect(sigA).toBe(sigB);
    expect(sigA).not.toBe(sigC);
  });
});

describe('computeExplorationStaleness — draft without a queries key', () => {
  it('never throws when draft.queries is entirely absent (falls back to [])', () => {
    const exploration = {
      draft: { insights: [{ name: 'ins', props: { x: '?{${ref(orders_q).region}}' } }] },
    };
    expect(() => computeExplorationStaleness(exploration, baseState)).not.toThrow();
    expect(computeExplorationStaleness(exploration, baseState).stale).toBe(false);
  });
});
