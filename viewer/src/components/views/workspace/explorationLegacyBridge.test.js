/* eslint-disable no-template-curly-in-string */
/**
 * explorationLegacyBridge — pure mapping between the legacy explorerStore
 * working-state snapshot and an exploration's `draft` (Explore 2.0 Phase 2).
 *
 * The disable above matches `explorerStore.js`'s own precedent — test fixtures
 * below include literal ref-serialization strings (`?{${ref(m).col}}`), not
 * actual template-literal interpolation.
 */
import {
  legacyStateToDraft,
  draftToLegacyState,
  legacyStateForSeed,
  draftSummary,
} from './explorationLegacyBridge';

const snapshot = () => ({
  modelTabs: ['orders_q'],
  activeModelName: 'orders_q',
  modelStates: {
    orders_q: {
      sql: 'SELECT * FROM orders',
      sourceName: 'warehouse',
      sourceEdited: false,
      computedColumns: [{ name: 'total', expression: 'a+b', type: 'metric' }],
      isNew: true,
    },
  },
  chartName: 'chart_1',
  chartLayout: { title: 'My chart' },
  chartInsightNames: ['insight_1'],
  activeInsightName: 'insight_1',
  insightStates: {
    insight_1: {
      type: 'bar',
      props: { x: '?{${ref(orders_q).a}}' },
      interactions: [{ type: 'filter', value: 'x > 1' }],
      typePropsCache: { scatter: { mode: 'markers' } },
      isNew: true,
    },
  },
  leftNavCollapsed: false,
  centerMode: 'split',
  isEditorCollapsed: false,
});

describe('legacyStateToDraft', () => {
  test('projects model tabs into draft.queries', () => {
    const draft = legacyStateToDraft(snapshot());
    expect(draft.queries).toEqual([
      { name: 'orders_q', sql: 'SELECT * FROM orders', source: 'warehouse' },
    ]);
  });

  test('projects insight states into draft.insights', () => {
    const draft = legacyStateToDraft(snapshot());
    expect(draft.insights).toEqual([
      {
        name: 'insight_1',
        type: 'bar',
        props: { x: '?{${ref(orders_q).a}}' },
        interactions: [{ type: 'filter', value: 'x > 1' }],
        isNew: true,
      },
    ]);
  });

  test('projects chart name/layout/insight order into draft.chart', () => {
    const draft = legacyStateToDraft(snapshot());
    expect(draft.chart).toEqual({
      name: 'chart_1',
      layout: { title: 'My chart' },
      insightNames: ['insight_1'],
    });
  });

  test('draft.chart is null when no chart exists', () => {
    const draft = legacyStateToDraft({ ...snapshot(), chartName: null });
    expect(draft.chart).toBeNull();
  });

  test('tags each computed column with its owning model name', () => {
    const draft = legacyStateToDraft(snapshot());
    expect(draft.computedColumns).toEqual([
      { name: 'total', expression: 'a+b', type: 'metric', modelName: 'orders_q' },
    ]);
  });

  test('carries the full snapshot losslessly under legacyState', () => {
    const snap = snapshot();
    const draft = legacyStateToDraft(snap);
    expect(draft.legacyState).toEqual(snap);
    // typePropsCache only survives via legacyState — the thin projection drops it.
    expect(draft.insights[0].typePropsCache).toBeUndefined();
  });

  test('handles an empty/undefined snapshot without crashing', () => {
    expect(legacyStateToDraft(undefined)).toEqual({
      queries: [],
      insights: [],
      chart: null,
      computedColumns: [],
      legacyState: {},
    });
  });
});

describe('draftToLegacyState', () => {
  test('round-trips losslessly via legacyState when present', () => {
    const snap = snapshot();
    const draft = legacyStateToDraft(snap);
    expect(draftToLegacyState(draft)).toEqual(snap);
  });

  test('reconstructs a minimal snapshot from the typed fields when legacyState is absent', () => {
    const draft = {
      queries: [{ name: 'q1', sql: 'SELECT 1', source: 'warehouse' }],
      insights: [{ name: 'i1', type: 'scatter', props: {}, interactions: [], isNew: true }],
      chart: { name: 'c1', layout: {}, insightNames: ['i1'] },
      computedColumns: [],
    };
    const restored = draftToLegacyState(draft);
    expect(restored.modelTabs).toEqual(['q1']);
    expect(restored.modelStates.q1).toMatchObject({ sql: 'SELECT 1', sourceName: 'warehouse' });
    expect(restored.chartName).toBe('c1');
    expect(restored.insightStates.i1).toMatchObject({ type: 'scatter' });
  });

  test('handles a null/empty draft without crashing', () => {
    const restored = draftToLegacyState(null);
    expect(restored.modelTabs).toEqual([]);
    expect(restored.chartName).toBeNull();
  });
});

describe('legacyStateForSeed', () => {
  test('seeds one model tab pre-wired to the source', () => {
    const seeded = legacyStateForSeed({ type: 'source', name: 'warehouse' });
    expect(seeded.modelTabs).toHaveLength(1);
    const modelName = seeded.modelTabs[0];
    expect(seeded.modelStates[modelName].sourceName).toBe('warehouse');
    expect(seeded.activeModelName).toBe(modelName);
  });

  test('returns null for a non-source seed', () => {
    expect(legacyStateForSeed({ type: 'model', name: 'orders' })).toBeNull();
    expect(legacyStateForSeed(null)).toBeNull();
  });
});

describe('draftSummary', () => {
  test('counts queries/insights from legacyState when present', () => {
    const draft = legacyStateToDraft(snapshot());
    expect(draftSummary(draft)).toEqual({ queryCount: 1, insightCount: 1 });
  });

  test('falls back to the typed fields when legacyState is absent', () => {
    const draft = {
      queries: [{ name: 'q1', sql: 'x' }],
      insights: [{ name: 'i1' }, { name: 'i2' }],
    };
    expect(draftSummary(draft)).toEqual({ queryCount: 1, insightCount: 2 });
  });

  test('handles an empty draft', () => {
    expect(draftSummary(null)).toEqual({ queryCount: 0, insightCount: 0 });
  });
});
