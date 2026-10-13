import { fetchProfile } from './profiles';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({
  apiFetch: jest.fn(),
  throwApiError: jest.requireActual('./utils').throwApiError,
}));

let mockAvailableKeys = new Set(['profiles']);
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params = {}) =>
    key === 'profileJobDetail' ? `/api/profiles/${params.jobId}/` : `/api/${key}/`,
  isAvailable: key => mockAvailableKeys.has(key),
}));

const ok = data => ({ status: 200, json: async () => data });
const fail = (status, data = {}) => ({ status, json: async () => data });
const accepted = jobId => ({
  status: 202,
  json: async () => ({ job_id: jobId, status: 'queued' }),
});
const envelope = (status, extra = {}) => ok({ job_id: 'j1', status, ...extra });

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

  it('scopes the request to a project when one is known (cloud)', async () => {
    apiFetch.mockResolvedValueOnce(ok({ profile: {}, shape_cards: [] }));

    await fetchProfile({ modelName: 'm', projectId: 'p-1' });

    expect(apiFetch.mock.calls[0][0]).toBe('/api/profiles/?project_id=p-1');
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
    apiFetch.mockResolvedValueOnce({
      status: 500,
      json: async () => {
        throw new Error('nope');
      },
    });

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

  describe('on a 202 (cloud: the profile is a job)', () => {
    const payload = { profile: { row_count: 2, columns: [] }, shape_cards: [] };

    it('polls the job at the detail route and resolves with its result', async () => {
      apiFetch
        .mockResolvedValueOnce(accepted('j1'))
        .mockResolvedValueOnce(envelope('running', { progress: 0.5 }))
        .mockResolvedValueOnce(envelope('completed', { result: payload }));

      const result = await fetchProfile({ sourceName: 'wh', sql: 'select 1', projectId: 'p-1' });

      expect(result).toEqual(payload);
      expect(apiFetch.mock.calls.map(([url]) => url)).toEqual([
        '/api/profiles/?project_id=p-1',
        '/api/profiles/j1/?project_id=p-1',
        '/api/profiles/j1/?project_id=p-1',
      ]);
    });

    it('throws the job error when the job fails', async () => {
      apiFetch
        .mockResolvedValueOnce(accepted('j1'))
        .mockResolvedValueOnce(envelope('failed', { error: 'relation "t" does not exist' }));

      await expect(fetchProfile({ sourceName: 'wh', sql: 'x' })).rejects.toMatchObject({
        message: 'relation "t" does not exist',
        errorType: undefined,
      });
    });

    it("recognises the runner's QueryTimeout as a timeout", async () => {
      apiFetch
        .mockResolvedValueOnce(accepted('j1'))
        .mockResolvedValueOnce(envelope('failed', { error: 'QueryTimeout: query exceeded 30s' }));

      await expect(fetchProfile({ sourceName: 'wh', sql: 'x' })).rejects.toMatchObject({
        message: 'QueryTimeout: query exceeded 30s',
        errorType: 'timeout',
      });
    });

    it('reports a job cancelled elsewhere', async () => {
      apiFetch.mockResolvedValueOnce(accepted('j1')).mockResolvedValueOnce(envelope('cancelled'));

      await expect(fetchProfile({ sourceName: 'wh', sql: 'x' })).rejects.toMatchObject({
        errorType: 'cancelled',
      });
    });

    it('gives up as a timeout when the job is still running at the deadline', async () => {
      const start = Date.now();
      // First call sets pollJob's deadline; everything after is past it.
      const now = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(start)
        .mockReturnValue(start + 61_000);
      apiFetch.mockResolvedValueOnce(accepted('j1')).mockResolvedValue(envelope('running'));

      try {
        await expect(fetchProfile({ sourceName: 'wh', sql: 'x' })).rejects.toMatchObject({
          errorType: 'timeout',
        });
      } finally {
        now.mockRestore();
      }
      // One poll, then the deadline — it never slept its way to a second.
      expect(apiFetch).toHaveBeenCalledTimes(2);
    });

    it('stops polling and reports an abort when the signal fires', async () => {
      const controller = new AbortController();
      apiFetch.mockResolvedValueOnce(accepted('j1')).mockImplementation((url, init) => {
        if (init?.signal?.aborted) return Promise.reject(new Error('The operation was aborted'));
        return Promise.resolve(envelope('running'));
      });
      controller.abort();

      await expect(
        fetchProfile({ sourceName: 'wh', sql: 'x', signal: controller.signal })
      ).rejects.toMatchObject({ errorType: 'aborted' });
      expect(apiFetch.mock.calls[1][1]).toEqual({ signal: controller.signal });
    });

    it('surfaces a poll that loses the job', async () => {
      apiFetch
        .mockResolvedValueOnce(accepted('j1'))
        .mockResolvedValueOnce(fail(404, { error: 'Not found.' }));

      await expect(fetchProfile({ sourceName: 'wh', sql: 'x' })).rejects.toMatchObject({
        message: 'Not found.',
      });
    });

    it('rejects a 202 that names no job', async () => {
      apiFetch.mockResolvedValueOnce({ status: 202, json: async () => ({}) });

      await expect(fetchProfile({ sourceName: 'wh', sql: 'x' })).rejects.toMatchObject({
        message: 'Server accepted the profile job but named no id',
        status: 202,
      });
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });
  });
});
