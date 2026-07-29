// Coverage for api/preferences.js. These had none before the split out of
// branching.js, and their whole contract is "never throw": the caller renders a
// control that must simply not appear where the endpoint is unavailable (dist),
// so an exception escaping here would take a page down over a missing toggle.
import { fetchPreferences, savePreferences } from './preferences';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => {
    // Mirrors the real getUrl: an unavailable key throws rather than returning
    // a broken URL. In `dist` mePreferences is null, so this is the live path.
    if (key === 'unavailable') throw new Error("URL key 'mePreferences' is not available");
    return `/api/${key}/`;
  },
}));

const res = (status, body = {}) => ({ status, json: async () => body });

beforeEach(() => apiFetch.mockReset());

describe('fetchPreferences', () => {
  it('returns the preferences on 200', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { run_trigger: 'manual' }));
    await expect(fetchPreferences()).resolves.toEqual({ run_trigger: 'manual' });
    expect(apiFetch).toHaveBeenCalledWith('/api/mePreferences/');
  });

  it('returns null on a non-200 instead of throwing', async () => {
    apiFetch.mockResolvedValueOnce(res(404));
    await expect(fetchPreferences()).resolves.toBeNull();
  });

  it('returns null when the request itself fails', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchPreferences()).resolves.toBeNull();
  });
});

describe('savePreferences', () => {
  it('PUTs the preferences and returns what the server stored', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { run_trigger: 'automatic' }));
    await expect(savePreferences({ run_trigger: 'automatic' })).resolves.toEqual({
      run_trigger: 'automatic',
    });
    const [url, options] = apiFetch.mock.calls[0];
    expect(url).toBe('/api/mePreferences/');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ run_trigger: 'automatic' });
  });

  it('returns null on rejection so the caller can revert its optimistic update', async () => {
    apiFetch.mockResolvedValueOnce(res(400, { run_trigger: ['invalid'] }));
    await expect(savePreferences({ run_trigger: 'sometimes' })).resolves.toBeNull();
  });

  it('returns null when the request itself fails', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(savePreferences({ run_trigger: 'manual' })).resolves.toBeNull();
  });
});
