/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * Insight compile-draft API client (Explore 2.0 Phase 4 — S2's resolved
 * design). A thin wire client mirroring `api/expressions.js`'s shape.
 */
import { compileDraftInsight } from './insightCompile';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

let mockAvailableKeys = new Set(['insightCompileDraft']);
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => `/api/${key}/`,
  isAvailable: key => mockAvailableKeys.has(key),
}));

const ok = (data, status = 200) => ({ status, json: async () => data });
const fail = (status, data = {}) => ({ status, json: async () => data });

beforeEach(() => {
  apiFetch.mockReset();
  mockAvailableKeys = new Set(['insightCompileDraft']);
});

describe('compileDraftInsight', () => {
  const insight = { name: 'draft_insight', props: { type: 'scatter' } };

  it('POSTs the draft insight + draft models/metrics/dimensions and returns query info on 200', async () => {
    const responseBody = {
      post_query: 'SELECT ...',
      pre_query: null,
      props_mapping: { x: 'a' },
      static_props: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [{ name: 'orders_q', name_hash: 'mabc' }],
    };
    apiFetch.mockResolvedValueOnce(ok(responseBody));

    const result = await compileDraftInsight({
      insight,
      draftModels: [{ name: 'orders_q', sql: 'select 1', source: '${ref(warehouse)}' }],
    });

    expect(result).toEqual(responseBody);
    expect(apiFetch).toHaveBeenCalledWith('/api/insightCompileDraft/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        insight,
        draft_models: [{ name: 'orders_q', sql: 'select 1', source: '${ref(warehouse)}' }],
        draft_metrics: [],
        draft_dimensions: [],
        model_schemas: {},
      }),
    });
  });

  it('defaults optional draft arrays/schemas to empty', async () => {
    apiFetch.mockResolvedValueOnce(ok({ post_query: 'x' }));
    await compileDraftInsight({ insight });
    const body = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(body.draft_models).toEqual([]);
    expect(body.draft_metrics).toEqual([]);
    expect(body.draft_dimensions).toEqual([]);
    expect(body.model_schemas).toEqual({});
  });

  it('throws a plain Error on a generic 400', async () => {
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'Invalid draft insight' }));
    await expect(compileDraftInsight({ insight })).rejects.toThrow('Invalid draft insight');
  });

  it('throws with errorType "model_not_run" + modelName on the graceful 422 (never-run scratch model)', async () => {
    apiFetch.mockResolvedValueOnce(
      fail(422, {
        error: 'Missing schema for model: cohort_q.',
        error_type: 'model_not_run',
        model: 'cohort_q',
      })
    );
    await expect(compileDraftInsight({ insight })).rejects.toMatchObject({
      message: 'Missing schema for model: cohort_q.',
      errorType: 'model_not_run',
      modelName: 'cohort_q',
    });
  });

  it('throws errorType "unavailable" without calling apiFetch when the endpoint is not available (dist mode)', async () => {
    mockAvailableKeys = new Set();
    await expect(compileDraftInsight({ insight })).rejects.toMatchObject({
      errorType: 'unavailable',
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
