/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * explorationLifecycle.js — Phase 6c-T5. Exhaustive coverage of the
 * ephemeral-until-edited state machine: every "meaningful content" signal,
 * every boundary (0/1/2+ items), the rename-away-from-default check, and the
 * top-level gallery-visibility predicate that composes them.
 */
import {
  seedDefaultName,
  hasMeaningfulExplorationContent,
  isExplorationRenamedFromSeedDefault,
  isExplorationVisibleInGallery,
} from './explorationLifecycle';

describe('seedDefaultName', () => {
  it('derives "<name> exploration" from a seed', () => {
    expect(seedDefaultName({ type: 'source', name: 'local-duckdb' })).toBe(
      'local-duckdb exploration'
    );
  });

  it('returns null for a null/undefined seed', () => {
    expect(seedDefaultName(null)).toBeNull();
    expect(seedDefaultName(undefined)).toBeNull();
  });

  it('returns null when the seed has no name', () => {
    expect(seedDefaultName({ type: 'source' })).toBeNull();
    expect(seedDefaultName({ type: 'source', name: null })).toBeNull();
  });

  it('returns null when the seed name is whitespace-only', () => {
    expect(seedDefaultName({ type: 'source', name: '   ' })).toBeNull();
  });

  it('returns null when the seed name is not a string', () => {
    expect(seedDefaultName({ type: 'source', name: 42 })).toBeNull();
  });
});

describe('hasMeaningfulExplorationContent', () => {
  it('is false for a null/undefined record', () => {
    expect(hasMeaningfulExplorationContent(null)).toBe(false);
    expect(hasMeaningfulExplorationContent(undefined)).toBe(false);
  });

  it('is true when anything has already been promoted, regardless of draft content', () => {
    const record = {
      promoted: [{ type: 'model', name: 'query_1' }],
      draft: { queries: [], insights: [], chart: null, computedColumns: [] },
    };
    expect(hasMeaningfulExplorationContent(record)).toBe(true);
  });

  it('treats an empty promoted array as no signal (falls through to content checks)', () => {
    const record = { promoted: [], draft: { queries: [], insights: [] } };
    expect(hasMeaningfulExplorationContent(record)).toBe(false);
  });

  it('treats a missing promoted field as no signal', () => {
    const record = { draft: { queries: [], insights: [] } };
    expect(hasMeaningfulExplorationContent(record)).toBe(false);
  });

  describe('typed-projection fallback (no draft.legacyState)', () => {
    it('is false for a completely empty draft', () => {
      expect(hasMeaningfulExplorationContent({ draft: {} })).toBe(false);
    });

    it('is false when draft itself is missing entirely', () => {
      expect(hasMeaningfulExplorationContent({})).toBe(false);
    });

    it('is true when there is more than one query', () => {
      const record = {
        draft: { queries: [{ name: 'a', sql: '' }, { name: 'b', sql: '' }], insights: [] },
      };
      expect(hasMeaningfulExplorationContent(record)).toBe(true);
    });

    it('is true when there is more than one insight', () => {
      const record = {
        draft: { queries: [], insights: [{ name: 'a', props: {} }, { name: 'b', props: {} }] },
      };
      expect(hasMeaningfulExplorationContent(record)).toBe(true);
    });

    it('is true when a query has non-empty (trimmed) sql', () => {
      const record = { draft: { queries: [{ name: 'a', sql: '  select 1  ' }], insights: [] } };
      expect(hasMeaningfulExplorationContent(record)).toBe(true);
    });

    it('is false when a query sql is empty or whitespace-only', () => {
      const record = { draft: { queries: [{ name: 'a', sql: '   ' }], insights: [] } };
      expect(hasMeaningfulExplorationContent(record)).toBe(false);
    });

    it('is false when a query has no sql field at all', () => {
      const record = { draft: { queries: [{ name: 'a' }], insights: [] } };
      expect(hasMeaningfulExplorationContent(record)).toBe(false);
    });

    it('is true when an insight has a non-empty props object', () => {
      const record = {
        draft: { queries: [], insights: [{ name: 'a', props: { x: '?{1}' } }] },
      };
      expect(hasMeaningfulExplorationContent(record)).toBe(true);
    });

    it('is false when an insight has an empty props object or none at all', () => {
      const record1 = { draft: { queries: [], insights: [{ name: 'a', props: {} }] } };
      const record2 = { draft: { queries: [], insights: [{ name: 'a' }] } };
      expect(hasMeaningfulExplorationContent(record1)).toBe(false);
      expect(hasMeaningfulExplorationContent(record2)).toBe(false);
    });

    it('is true when there are computed columns', () => {
      const record = {
        draft: { queries: [], insights: [], computedColumns: [{ name: 'metric_a' }] },
      };
      expect(hasMeaningfulExplorationContent(record)).toBe(true);
    });

    it('is false with exactly one empty query and one empty insight and no computed columns', () => {
      const record = {
        draft: {
          queries: [{ name: 'query_1', sql: '' }],
          insights: [{ name: 'insight', props: {} }],
          computedColumns: [],
        },
      };
      expect(hasMeaningfulExplorationContent(record)).toBe(false);
    });
  });

  describe('legacyState branch (draft.legacyState present)', () => {
    const baseLegacy = () => ({
      modelStates: { query_1: { sql: '' } },
      insightStates: { insight: { type: 'scatter', props: {}, interactions: [] } },
      chartLayout: {},
    });

    it('is false for exactly-seeded content: one empty model, one empty insight, no layout', () => {
      const record = { draft: { legacyState: baseLegacy() } };
      expect(hasMeaningfulExplorationContent(record)).toBe(false);
    });

    it('is true when there is more than one model', () => {
      const legacy = baseLegacy();
      legacy.modelStates = { query_1: { sql: '' }, query_2: { sql: '' } };
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(true);
    });

    it('is true when a model has non-empty (trimmed) sql', () => {
      const legacy = baseLegacy();
      legacy.modelStates.query_1.sql = '  select * from t  ';
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(true);
    });

    it('is false when a model sql is whitespace-only', () => {
      const legacy = baseLegacy();
      legacy.modelStates.query_1.sql = '   ';
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(false);
    });

    it('is true when a model has computed columns', () => {
      const legacy = baseLegacy();
      legacy.modelStates.query_1.computedColumns = [{ name: 'churn_rate' }];
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(true);
    });

    it('is true when there is more than one insight', () => {
      const legacy = baseLegacy();
      legacy.insightStates = {
        insight: { props: {}, interactions: [] },
        insight_2: { props: {}, interactions: [] },
      };
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(true);
    });

    it('is true when an insight has a bound prop', () => {
      const legacy = baseLegacy();
      legacy.insightStates.insight.props = { x: '?{${ref(query_1).X}}' };
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(true);
    });

    it('is true when an insight has an interaction', () => {
      const legacy = baseLegacy();
      legacy.insightStates.insight.interactions = [{ type: 'split', value: 'region' }];
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(true);
    });

    it('is true when the chart layout has any config', () => {
      const legacy = baseLegacy();
      legacy.chartLayout = { title: { text: 'Revenue' } };
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(true);
    });

    it('handles a legacyState with no modelStates/insightStates/chartLayout keys at all', () => {
      const record = { draft: { legacyState: {} } };
      expect(hasMeaningfulExplorationContent(record)).toBe(false);
    });

    it('treats an insight state missing its props/interactions fields entirely as empty (fallback defaults)', () => {
      const legacy = baseLegacy();
      legacy.insightStates = { insight: {} };
      expect(hasMeaningfulExplorationContent({ draft: { legacyState: legacy } })).toBe(false);
    });
  });
});

describe('isExplorationRenamedFromSeedDefault', () => {
  it('is false when there is no seededFrom at all', () => {
    expect(isExplorationRenamedFromSeedDefault({ name: 'anything', seededFrom: null })).toBe(
      false
    );
    expect(isExplorationRenamedFromSeedDefault({ name: 'anything' })).toBe(false);
  });

  it('is false when the name still matches the deterministic default', () => {
    const record = {
      name: 'local-duckdb exploration',
      seededFrom: { type: 'source', name: 'local-duckdb' },
    };
    expect(isExplorationRenamedFromSeedDefault(record)).toBe(false);
  });

  it('is true when the name has been changed away from the default', () => {
    const record = {
      name: 'Revenue deep-dive',
      seededFrom: { type: 'source', name: 'local-duckdb' },
    };
    expect(isExplorationRenamedFromSeedDefault(record)).toBe(true);
  });

  it('is false when the seed itself cannot produce a default name (no name on the seed)', () => {
    const record = { name: 'Exploration 2', seededFrom: { type: 'source' } };
    expect(isExplorationRenamedFromSeedDefault(record)).toBe(false);
  });
});

describe('isExplorationVisibleInGallery', () => {
  it('is false for a null/undefined record', () => {
    expect(isExplorationVisibleInGallery(null)).toBe(false);
    expect(isExplorationVisibleInGallery(undefined)).toBe(false);
  });

  it('is always true for a blank ("+ New exploration") record with no seededFrom, even fully empty', () => {
    const record = {
      seededFrom: null,
      name: 'Exploration 2',
      draft: { queries: [], insights: [] },
      promoted: [],
    };
    expect(isExplorationVisibleInGallery(record)).toBe(true);
  });

  it('is false for an untouched seeded exploration: default name, no content, nothing promoted', () => {
    const record = {
      seededFrom: { type: 'source', name: 'local-duckdb' },
      name: 'local-duckdb exploration',
      draft: {
        legacyState: {
          modelStates: { query_1: { sql: '' } },
          insightStates: { insight: { props: {}, interactions: [] } },
          chartLayout: {},
        },
      },
      promoted: [],
    };
    expect(isExplorationVisibleInGallery(record)).toBe(false);
  });

  it('is true for a seeded exploration once it has meaningful content', () => {
    const record = {
      seededFrom: { type: 'source', name: 'local-duckdb' },
      name: 'local-duckdb exploration',
      draft: {
        legacyState: {
          modelStates: { query_1: { sql: 'select * from t' } },
          insightStates: {},
          chartLayout: {},
        },
      },
      promoted: [],
    };
    expect(isExplorationVisibleInGallery(record)).toBe(true);
  });

  it('is true for a seeded exploration that has been renamed, even with an empty draft', () => {
    const record = {
      seededFrom: { type: 'source', name: 'local-duckdb' },
      name: 'Revenue deep-dive',
      draft: {
        legacyState: {
          modelStates: { query_1: { sql: '' } },
          insightStates: {},
          chartLayout: {},
        },
      },
      promoted: [],
    };
    expect(isExplorationVisibleInGallery(record)).toBe(true);
  });

  it('is false for an untouched seeded exploration whose `promoted` field is entirely absent (fallback default)', () => {
    const record = {
      seededFrom: { type: 'source', name: 'local-duckdb' },
      name: 'local-duckdb exploration',
      draft: {
        legacyState: {
          modelStates: { query_1: { sql: '' } },
          insightStates: {},
          chartLayout: {},
        },
      },
    };
    expect(isExplorationVisibleInGallery(record)).toBe(false);
  });

  it('is true for a seeded exploration with something already promoted, regardless of draft content', () => {
    const record = {
      seededFrom: { type: 'source', name: 'local-duckdb' },
      name: 'local-duckdb exploration',
      draft: {
        legacyState: {
          modelStates: { query_1: { sql: '' } },
          insightStates: {},
          chartLayout: {},
        },
      },
      promoted: [{ type: 'model', name: 'query_1' }],
    };
    expect(isExplorationVisibleInGallery(record)).toBe(true);
  });
});
