import { fetchProfile } from './profiles';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

let mockAvailableKeys = new Set(['profiles']);
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => `/api/${key}/`,
  isAvailable: key => mockAvailableKeys.has(key),
}));

const ok = data => ({ status: 200, json: async () => data });
const fail = (status, data = {}) => ({ status, json: async () => data });

beforeEach(() => {
  apiFetch.mockReset();
  mockAvailableKeys = new Set(['profiles']);
});

describe('fetchProfile', () => {
  it('profiles a query with the source name and sql', async () => {
    const payload = { profile: { row_count: 6, columns: [] }, shape_cards: [] };
    apiFetch.mockResolvedValueOnce(ok(payload));

    const result = await fetchProfile({ sourceName: 'wh', sql: 'select 1', columns: ['x'] });

    expect(result).toEqual(payload);
    expect(apiFetch).toHaveBeenCalledWith('/api/profiles/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_name: 'wh', sql: 'select 1', columns: ['x'] }),
    });
  });

  it('profiles a model by name, with a sample size when asked', async () => {
    apiFetch.mockResolvedValueOnce(ok({ profile: {}, shape_cards: [] }));

    await fetchProfile({ modelName: 'orders', sampleRows: 500 });

    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      model_name: 'orders',
      sample_rows: 500,
    });
  });

  it('surfaces the server error and type', async () => {
    apiFetch.mockResolvedValueOnce(fail(504, { error: 'too slow', error_type: 'timeout' }));

    await expect(fetchProfile({ sourceName: 'wh', sql: 'x' })).rejects.toMatchObject({
      message: 'too slow',
      errorType: 'timeout',
      status: 504,
    });
  });

  it('falls back to a generic message when the body is not json', async () => {
    apiFetch.mockResolvedValueOnce({ status: 500, json: async () => { throw new Error('nope'); } });

    await expect(fetchProfile({ modelName: 'm' })).rejects.toMatchObject({
      message: 'Failed to profile',
      status: 500,
    });
  });

  it('refuses when the deployment has no profiles route', async () => {
    mockAvailableKeys = new Set();

    await expect(fetchProfile({ modelName: 'm' })).rejects.toMatchObject({
      errorType: 'unavailable',
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
