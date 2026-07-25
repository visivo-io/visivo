/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * Insight execute-draft API client (Explore 2.0 state fix, Phase 3) — the
 * server-side aggregate lane. Mirrors compileDraftInsight's shape.
 */
import { executeDraftInsight } from './insightExecuteDraft';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

let mockAvailableKeys = new Set(['insightExecuteDraft']);
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => `/api/${key}/`,
  isAvailable: key => mockAvailableKeys.has(key),
}));

const ok = (data, status = 200) => ({ status, json: async () => data });
const fail = (status, data = {}) => ({ status, json: async () => data });

beforeEach(() => {
  apiFetch.mockReset();
  mockAvailableKeys = new Set(['insightExecuteDraft']);
});

describe('executeDraftInsight', () => {
  const insight = { name: 'sales_by_region', props: { type: 'bar' } };

  it('POSTs the draft insight and returns the executed rows on 200', async () => {
    const responseBody = {
      columns: ['region', 'total'],
      rows: [{ region: 'west', total: 30 }],
      row_count: 1,
      execution_time_ms: 4,
      props_mapping: { 'props.y': 'total' },
      static_props: {},
      props_slices: {},
      split_key: null,
      type: 'bar',
      models: [{ name: 'orders_q', name_hash: 'mabc' }],
    };
    apiFetch.mockResolvedValueOnce(ok(responseBody));

    const result = await executeDraftInsight({
      insight,
      modelSchemas: { orders_q: { region: 'VARCHAR', amount: 'INTEGER' } },
    });

    expect(result).toEqual(responseBody);
    expect(apiFetch).toHaveBeenCalledWith('/api/insightExecuteDraft/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        insight,
        draft_models: [],
        draft_metrics: [],
        draft_dimensions: [],
        model_schemas: { orders_q: { region: 'VARCHAR', amount: 'INTEGER' } },
      }),
    });
  });

  it('surfaces a 409 as errorType "requires_client_lane" (client falls back to its sample lane)', async () => {
    apiFetch.mockResolvedValueOnce(
      fail(409, { error: 'dynamic', error_type: 'requires_client_lane' })
    );
    await expect(executeDraftInsight({ insight })).rejects.toMatchObject({
      errorType: 'requires_client_lane',
    });
  });

  it('surfaces a 422 as errorType "model_not_run" and carries the model name', async () => {
    apiFetch.mockResolvedValueOnce(
      fail(422, { error: 'Missing schema for model: cohort_q.', error_type: 'model_not_run', model: 'cohort_q' })
    );
    await expect(executeDraftInsight({ insight })).rejects.toMatchObject({
      errorType: 'model_not_run',
      modelName: 'cohort_q',
    });
  });

  it('throws "unavailable" without hitting the network when the endpoint is not configured (dist)', async () => {
    mockAvailableKeys = new Set(); // insightExecuteDraft not available
    await expect(executeDraftInsight({ insight })).rejects.toMatchObject({ errorType: 'unavailable' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
