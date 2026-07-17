/**
 * Exploration API client (Explore 2.0 Phase 1 — S3 wire contract).
 *
 * A thin wire client: each helper resolves its endpoint via URLContext and
 * either returns the parsed JSON on success or throws (surfacing the
 * server's `error` message when parseable, a generic fallback otherwise).
 */
import {
  fetchExplorations,
  createExploration,
  fetchExploration,
  updateExploration,
  deleteExploration,
  consumeReturnTo,
} from './explorations';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params = {}) =>
    key === 'explorationsList'
      ? '/api/explorations/'
      : key === 'explorationDetail'
        ? `/api/explorations/${params.id}/`
        : key === 'explorationConsumeReturnTo'
          ? `/api/explorations/${params.id}/consume-return-to/`
          : `/api/${key}/`,
}));

const ok = (data, status = 200) => ({ status, json: async () => data });
const fail = (status, data = {}) => ({ status, json: async () => data });
const failUnparseable = status => ({
  status,
  json: async () => {
    throw new Error('malformed body');
  },
});

beforeEach(() => {
  apiFetch.mockReset();
});

describe('fetchExplorations', () => {
  it('returns the list on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ id: 'exp_1', name: 'Scratch' }]));
    await expect(fetchExplorations()).resolves.toEqual([{ id: 'exp_1', name: 'Scratch' }]);
    expect(apiFetch).toHaveBeenCalledWith('/api/explorations/');
  });

  it('throws a stable message on non-200', async () => {
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchExplorations()).rejects.toThrow('Failed to fetch explorations');
  });
});

describe('createExploration', () => {
  it('POSTs the payload and returns the created record on 201', async () => {
    apiFetch.mockResolvedValueOnce(ok({ id: 'exp_new', name: 'Scratch' }, 201));
    await expect(createExploration({ name: 'Scratch' })).resolves.toEqual({
      id: 'exp_new',
      name: 'Scratch',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/explorations/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Scratch' }),
    });
  });

  it('defaults to an empty payload when called with no arguments', async () => {
    apiFetch.mockResolvedValueOnce(ok({ id: 'exp_new', name: 'Scratch' }, 201));
    await createExploration();
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/explorations/',
      expect.objectContaining({ body: '{}' })
    );
  });

  it('surfaces the server error message on failure', async () => {
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'malformed body' }));
    await expect(createExploration({})).rejects.toThrow('malformed body');
  });

  it('falls back to a generic message when the failure body is unparseable', async () => {
    apiFetch.mockResolvedValueOnce(failUnparseable(500));
    await expect(createExploration({})).rejects.toThrow('Failed to create exploration');
  });
});

describe('fetchExploration', () => {
  it('returns the record on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok({ id: 'exp_1', name: 'Scratch' }));
    await expect(fetchExploration('exp_1')).resolves.toEqual({ id: 'exp_1', name: 'Scratch' });
    expect(apiFetch).toHaveBeenCalledWith('/api/explorations/exp_1/');
  });

  it('returns null on 404 (not a throw)', async () => {
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(fetchExploration('exp_missing')).resolves.toBeNull();
  });

  it('throws on other failures', async () => {
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchExploration('exp_1')).rejects.toThrow('Failed to fetch exploration: exp_1');
  });
});

describe('updateExploration', () => {
  it('POSTs (not PUTs) the patch and returns the updated record', async () => {
    apiFetch.mockResolvedValueOnce(ok({ id: 'exp_1', name: 'Renamed' }));
    await expect(updateExploration('exp_1', { name: 'Renamed' })).resolves.toEqual({
      id: 'exp_1',
      name: 'Renamed',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/explorations/exp_1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
  });

  it('throws on 404', async () => {
    apiFetch.mockResolvedValueOnce(fail(404, { error: 'Exploration not found' }));
    await expect(updateExploration('exp_missing', { name: 'x' })).rejects.toThrow(
      'Exploration not found'
    );
  });

  it('falls back to a generic message when the failure body is unparseable', async () => {
    apiFetch.mockResolvedValueOnce(failUnparseable(500));
    await expect(updateExploration('exp_1', {})).rejects.toThrow('Failed to update exploration');
  });
});

describe('deleteExploration', () => {
  it('resolves true on 204', async () => {
    apiFetch.mockResolvedValueOnce(ok(undefined, 204));
    await expect(deleteExploration('exp_1')).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledWith('/api/explorations/exp_1/', { method: 'DELETE' });
  });

  it('throws on 404', async () => {
    apiFetch.mockResolvedValueOnce(fail(404, { error: 'Exploration not found' }));
    await expect(deleteExploration('exp_missing')).rejects.toThrow('Exploration not found');
  });
});

describe('consumeReturnTo', () => {
  it('POSTs to the consume-return-to endpoint and returns the updated record', async () => {
    apiFetch.mockResolvedValueOnce(ok({ id: 'exp_1', return_to: null }));
    await expect(consumeReturnTo('exp_1')).resolves.toEqual({ id: 'exp_1', return_to: null });
    expect(apiFetch).toHaveBeenCalledWith('/api/explorations/exp_1/consume-return-to/', {
      method: 'POST',
    });
  });

  it('throws on 404', async () => {
    apiFetch.mockResolvedValueOnce(fail(404, { error: 'Exploration not found' }));
    await expect(consumeReturnTo('exp_missing')).rejects.toThrow('Exploration not found');
  });
});
