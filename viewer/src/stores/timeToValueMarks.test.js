/* Time-to-value ladder call sites in the per-type stores (Guided First Run W1).
 *
 * timeToValue.test.js pins the ladder itself; this pins that the three store
 * writes feeding it are wired, fire once, fire only on success, and never put a
 * user-authored name into a payload. Uses the real timeToValue module and
 * asserts against the event buffer, so a call site passing the wrong step id
 * fails here.
 */

import createSourceSlice from './sourceStore';
import createModelSlice from './modelStore';
import createInsightSlice from './insightStore';
import * as sourcesApi from '../api/sources';
import * as modelsApi from '../api/models';
import * as insightsApi from '../api/insights';
import { clearEventBuffer, getEventBuffer } from '../components/onboarding/telemetry';
import { clearTimeToValueLedger } from '../components/onboarding/timeToValue';

jest.mock('../api/sources');
jest.mock('../api/models');
jest.mock('../api/insights');

/* Minimal stand-in for a zustand store, matching perTypeStores.test.js. */
const makeStore = (slice, initial = {}) => {
  let state = { ...initial };
  const set = patch => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const get = () => state;
  state = { ...state, ...slice(set, get) };
  return { get };
};

const marksFor = event => getEventBuffer().filter(e => e.event === event);

beforeEach(() => {
  jest.clearAllMocks();
  clearEventBuffer();
  clearTimeToValueLedger();
  delete window.__VISIVO_FIRST_RUN;
  delete window.__VISIVO_TELEMETRY_DISABLED;
});

describe('source_connected (step 2)', () => {
  test('a successful save marks the step, carrying the type but not the name', async () => {
    sourcesApi.saveSource.mockResolvedValue({ ok: true });
    sourcesApi.fetchAllSources.mockResolvedValue({ sources: [] });
    const store = makeStore(createSourceSlice);

    await store.get().saveSource('acme_production_warehouse', {
      name: 'acme_production_warehouse',
      type: 'snowflake',
    });

    const [mark] = marksFor('source_connected');
    expect(mark.props.step_index).toBe(2);
    expect(mark.props.source_type).toBe('snowflake');
    expect(mark.props.via).toBe('source_store');
    expect(JSON.stringify(mark.props)).not.toContain('acme_production_warehouse');
  });

  test('a second source does not re-mark the step', async () => {
    sourcesApi.saveSource.mockResolvedValue({ ok: true });
    sourcesApi.fetchAllSources.mockResolvedValue({ sources: [] });
    const store = makeStore(createSourceSlice);

    await store.get().saveSource('one', { name: 'one', type: 'duckdb' });
    await store.get().saveSource('two', { name: 'two', type: 'postgresql' });

    expect(marksFor('source_connected')).toHaveLength(1);
  });

  test('a failed save marks nothing — the clock must not start on an error', async () => {
    sourcesApi.saveSource.mockRejectedValue(new Error('could not connect'));
    const store = makeStore(createSourceSlice);

    const result = await store.get().saveSource('one', { name: 'one', type: 'duckdb' });

    expect(result.success).toBe(false);
    expect(marksFor('source_connected')).toHaveLength(0);
  });
});

describe('first_model_created (step 4)', () => {
  test('a successful save marks the step with no name in the payload', async () => {
    modelsApi.saveModel.mockResolvedValue({ ok: true });
    modelsApi.fetchAllModels.mockResolvedValue({ models: [] });
    const store = makeStore(createModelSlice);

    await store.get().saveModel('quarterly_revenue_by_rep', { name: 'quarterly_revenue_by_rep' });

    const [mark] = marksFor('first_model_created');
    expect(mark.props.step_index).toBe(4);
    expect(JSON.stringify(mark.props)).not.toContain('quarterly_revenue_by_rep');
  });

  test('a second model does not re-mark the step', async () => {
    modelsApi.saveModel.mockResolvedValue({ ok: true });
    modelsApi.fetchAllModels.mockResolvedValue({ models: [] });
    const store = makeStore(createModelSlice);

    await store.get().saveModel('a', {});
    await store.get().saveModel('b', {});

    expect(marksFor('first_model_created')).toHaveLength(1);
  });

  test('a failed save marks nothing', async () => {
    modelsApi.saveModel.mockRejectedValue(new Error('invalid sql'));
    const store = makeStore(createModelSlice);

    await store.get().saveModel('a', {});

    expect(marksFor('first_model_created')).toHaveLength(0);
  });
});

describe('first_insight_created (step 5)', () => {
  test('a successful save marks the step with no name in the payload', async () => {
    insightsApi.saveInsight.mockResolvedValue({ ok: true });
    insightsApi.fetchAllInsights.mockResolvedValue({ insights: [] });
    const store = makeStore(createInsightSlice);

    await store.get().saveInsight('revenue_by_month', { name: 'revenue_by_month' });

    const [mark] = marksFor('first_insight_created');
    expect(mark.props.step_index).toBe(5);
    expect(JSON.stringify(mark.props)).not.toContain('revenue_by_month');
  });

  test('a second insight does not re-mark the step', async () => {
    insightsApi.saveInsight.mockResolvedValue({ ok: true });
    insightsApi.fetchAllInsights.mockResolvedValue({ insights: [] });
    const store = makeStore(createInsightSlice);

    await store.get().saveInsight('a', {});
    await store.get().saveInsight('b', {});

    expect(marksFor('first_insight_created')).toHaveLength(1);
  });

  test('a failed save marks nothing', async () => {
    insightsApi.saveInsight.mockRejectedValue(new Error('bad props'));
    const store = makeStore(createInsightSlice);

    await store.get().saveInsight('a', {});

    expect(marksFor('first_insight_created')).toHaveLength(0);
  });
});

describe('the journey across stores', () => {
  test('marks accumulate into one journey, in ladder order', async () => {
    sourcesApi.saveSource.mockResolvedValue({ ok: true });
    sourcesApi.fetchAllSources.mockResolvedValue({ sources: [] });
    modelsApi.saveModel.mockResolvedValue({ ok: true });
    modelsApi.fetchAllModels.mockResolvedValue({ models: [] });
    insightsApi.saveInsight.mockResolvedValue({ ok: true });
    insightsApi.fetchAllInsights.mockResolvedValue({ insights: [] });

    await makeStore(createSourceSlice).get().saveSource('s', { name: 's', type: 'duckdb' });
    await makeStore(createModelSlice).get().saveModel('m', {});
    await makeStore(createInsightSlice).get().saveInsight('i', {});

    const journeyIds = new Set(getEventBuffer().map(e => e.props.journey_id));
    expect(journeyIds.size).toBe(1);
    expect(getEventBuffer().map(e => e.props.step_index)).toEqual([2, 4, 5]);
  });

  test('with telemetry disabled, no store write marks anything', async () => {
    window.__VISIVO_TELEMETRY_DISABLED = true;
    sourcesApi.saveSource.mockResolvedValue({ ok: true });
    sourcesApi.fetchAllSources.mockResolvedValue({ sources: [] });
    modelsApi.saveModel.mockResolvedValue({ ok: true });
    modelsApi.fetchAllModels.mockResolvedValue({ models: [] });
    insightsApi.saveInsight.mockResolvedValue({ ok: true });
    insightsApi.fetchAllInsights.mockResolvedValue({ insights: [] });

    await makeStore(createSourceSlice).get().saveSource('s', { name: 's', type: 'duckdb' });
    await makeStore(createModelSlice).get().saveModel('m', {});
    await makeStore(createInsightSlice).get().saveInsight('i', {});

    expect(getEventBuffer()).toHaveLength(0);
    expect(window.localStorage.getItem('visivo.ttv.v1')).toBeNull();
  });
});
