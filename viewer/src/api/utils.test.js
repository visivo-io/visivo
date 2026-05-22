import { apiFetch, authHeaders, setAuthHeaderProvider } from './utils';

global.fetch = jest.fn();

const headerEntries = headers => {
  if (!headers) return [];
  if (headers instanceof Headers) {
    return [...headers.entries()];
  }
  return Object.entries(headers);
};

const getRequestHeaders = call => {
  const [, init] = call;
  return Object.fromEntries(headerEntries(init?.headers));
};

describe('viewer/api/utils', () => {
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true, status: 200 });
    // Restore the module-level default no-op provider between tests.
    setAuthHeaderProvider(() => ({}));
  });

  describe('setAuthHeaderProvider / authHeaders', () => {
    test('default provider returns an empty header set', () => {
      expect(authHeaders()).toEqual({});
    });

    test('accepts a function provider', () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT t1' }));
      expect(authHeaders()).toEqual({ Authorization: 'JWT t1' });
    });

    test('accepts a plain-object provider (wrapped as a thunk)', () => {
      setAuthHeaderProvider({ Authorization: 'JWT t2' });
      expect(authHeaders()).toEqual({ Authorization: 'JWT t2' });
    });

    test('null / undefined provider falls back to empty headers', () => {
      setAuthHeaderProvider(null);
      expect(authHeaders()).toEqual({});
      setAuthHeaderProvider(undefined);
      expect(authHeaders()).toEqual({});
    });

    test('provider returning a non-object is coerced to empty headers', () => {
      setAuthHeaderProvider(() => 'not-an-object');
      expect(authHeaders()).toEqual({});
    });
  });

  describe('apiFetch — when to inject auth headers', () => {
    test('skips injection when default no-op provider is installed', async () => {
      await apiFetch('/api/dashboards/');

      expect(fetch).toHaveBeenCalledTimes(1);
      const headers = getRequestHeaders(fetch.mock.calls[0]);
      expect(headers.authorization).toBeUndefined();
      expect(headers.Authorization).toBeUndefined();
    });

    test('injects Authorization on same-origin /api/* relative URLs', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT abc' }));

      await apiFetch('/api/dashboards/');

      expect(fetch).toHaveBeenCalledTimes(1);
      const headers = getRequestHeaders(fetch.mock.calls[0]);
      expect(headers.authorization || headers.Authorization).toBe('JWT abc');
    });

    test('injects Authorization on same-origin /api/* absolute URLs', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT abc' }));

      await apiFetch(`${window.location.origin}/api/charts/`);

      const headers = getRequestHeaders(fetch.mock.calls[0]);
      expect(headers.authorization || headers.Authorization).toBe('JWT abc');
    });

    test('skips injection on same-origin non-/api/ URLs', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT abc' }));

      await apiFetch('/static/img/logo.png');

      const headers = getRequestHeaders(fetch.mock.calls[0]);
      expect(headers.authorization).toBeUndefined();
      expect(headers.Authorization).toBeUndefined();
    });

    test('skips injection on cross-origin URLs (e.g. GCS signed URLs)', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT abc' }));

      await apiFetch('https://storage.googleapis.com/bucket/file.parquet?sig=...');

      const headers = getRequestHeaders(fetch.mock.calls[0]);
      expect(headers.authorization).toBeUndefined();
      expect(headers.Authorization).toBeUndefined();
    });

    test('preserves caller-supplied Headers and merges auth alongside them', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT abc' }));

      await apiFetch('/api/charts/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Trace-Id': 'trace-1' },
        body: '{}',
      });

      const [, init] = fetch.mock.calls[0];
      const merged = Object.fromEntries(headerEntries(init.headers));

      expect(merged['content-type'] || merged['Content-Type']).toBe('application/json');
      expect(merged['x-trace-id'] || merged['X-Trace-Id']).toBe('trace-1');
      expect(merged.authorization || merged.Authorization).toBe('JWT abc');
      expect(init.method).toBe('POST');
      expect(init.body).toBe('{}');
    });

    test('does NOT overwrite a caller-supplied Authorization header', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT provider-token' }));

      await apiFetch('/api/charts/', {
        headers: { Authorization: 'Bearer caller-token' },
      });

      const [, init] = fetch.mock.calls[0];
      const headers = Object.fromEntries(headerEntries(init.headers));
      expect(headers.authorization || headers.Authorization).toBe('Bearer caller-token');
    });

    test('passes through with no auth header when provider returns empty headers', async () => {
      setAuthHeaderProvider(() => ({}));

      await apiFetch('/api/dashboards/');

      const headers = getRequestHeaders(fetch.mock.calls[0]);
      expect(headers.authorization).toBeUndefined();
      expect(headers.Authorization).toBeUndefined();
    });
  });
});
