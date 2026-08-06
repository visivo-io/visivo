/**
 * api/explorer.js — B7 (Explore 2.0 Phase 0): 7 of the module's 8 exports had
 * no production caller (only their own tests, since deleted alongside them);
 * `fetchDiff` is the sole survivor — `stores/explorerStore.js` dynamically
 * imports it for the exploration diff panel.
 */
import { fetchDiff } from './explorer';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

describe('fetchDiff', () => {
  beforeEach(() => {
    apiFetch.mockClear();
  });

  it('POSTs the payload and returns the parsed diff on success', async () => {
    const payload = { insight: { name: 'churn' } };
    const diffResult = { added: [], removed: [], changed: [] };
    apiFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => diffResult,
    });

    const result = await fetchDiff(payload);

    expect(apiFetch).toHaveBeenCalledWith('/api/explorer/diff/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(result).toEqual(diffResult);
  });

  it('returns null on a non-200 response', async () => {
    apiFetch.mockResolvedValueOnce({ status: 500 });

    const result = await fetchDiff({});

    expect(result).toBeNull();
  });
});

describe('fetchDiff project scoping', () => {
  // Cloud hosts many projects and answers 400 without this; local serve has
  // one and ignores it. Sending it unconditionally would put `?project_id=`
  // on every local request for no reason, so it is opt-in.
  it('scopes the request to the project when one is known', async () => {
    apiFetch.mockResolvedValue({ status: 200, json: async () => ({}) });
    await fetchDiff({ models: {} }, 'proj-1');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/explorer/diff/?project_id=proj-1',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('omits the param when there is no project', async () => {
    apiFetch.mockResolvedValue({ status: 200, json: async () => ({}) });
    await fetchDiff({ models: {} });
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/explorer/diff/',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('encodes a project id that needs it', async () => {
    apiFetch.mockResolvedValue({ status: 200, json: async () => ({}) });
    await fetchDiff({ models: {} }, 'a b/c');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/explorer/diff/?project_id=a%20b%2Fc',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
