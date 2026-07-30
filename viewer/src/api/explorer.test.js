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
