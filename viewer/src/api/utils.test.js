import {
  apiFetch,
  authHeaders,
  setAuthHeaderProvider,
  setUnauthorizedHandler,
  throwApiError,
} from './utils';

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
    // Restore the module-level default no-op provider + handler between tests.
    setAuthHeaderProvider(() => ({}));
    setUnauthorizedHandler(null);
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

  describe('apiFetch — 401 refresh-and-retry', () => {
    test('refreshes the token and retries once on 401', async () => {
      let token = 'expired';
      setAuthHeaderProvider(() => ({ Authorization: `JWT ${token}` }));
      const handler = jest.fn().mockImplementation(async () => {
        token = 'fresh';
        return true;
      });
      setUnauthorizedHandler(handler);
      fetch
        .mockResolvedValueOnce({ status: 401 })
        .mockResolvedValueOnce({ status: 200, ok: true });

      const res = await apiFetch('/api/charts/');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      const retryHeaders = getRequestHeaders(fetch.mock.calls[1]);
      expect(retryHeaders.authorization || retryHeaders.Authorization).toBe('JWT fresh');
      expect(res.status).toBe(200);
    });

    test('does not retry when the handler reports no refresh', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT x' }));
      setUnauthorizedHandler(async () => false);
      fetch.mockResolvedValue({ status: 401 });

      const res = await apiFetch('/api/charts/');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(401);
    });

    test('passes a 401 through unchanged when no handler is registered', async () => {
      setAuthHeaderProvider(() => ({ Authorization: 'JWT x' }));
      fetch.mockResolvedValue({ status: 401 });

      const res = await apiFetch('/api/charts/');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(401);
    });
  });
});

describe('throwApiError', () => {
  const response = (status, body) => ({
    status,
    json:
      body instanceof Error
        ? async () => {
            throw body;
          }
        : async () => body,
  });

  test("throws the body's error with its type and the status", async () => {
    await expect(
      throwApiError(
        response(422, { error: 'no schema', error_type: 'model_not_run', model: 'm1' }),
        'fallback'
      )
    ).rejects.toMatchObject({
      message: 'no schema',
      errorType: 'model_not_run',
      status: 422,
      modelName: 'm1',
    });
  });

  test('falls back to the given message when the body is not JSON', async () => {
    await expect(throwApiError(response(500, new Error('nope')), 'fallback')).rejects.toMatchObject(
      {
        message: 'fallback',
        status: 500,
        errorType: undefined,
      }
    );
  });

  test('falls back to the given message when the body names no error', async () => {
    const err = await throwApiError(response(400, { detail: 'x' }), 'fallback').catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('fallback');
    expect(err).not.toHaveProperty('modelName');
  });

  test('a 504 without an explicit type is a timeout', async () => {
    await expect(throwApiError(response(504, { error: 'slow' }), 'fallback')).rejects.toMatchObject(
      {
        message: 'slow',
        errorType: 'timeout',
        status: 504,
      }
    );
  });

  test("the body's own error_type wins over the 504 default", async () => {
    await expect(
      throwApiError(response(504, { error: 'slow', error_type: 'upstream' }), 'fallback')
    ).rejects.toMatchObject({ errorType: 'upstream' });
  });

  test('tolerates a non-object JSON body', async () => {
    await expect(throwApiError(response(502, 'Bad Gateway'), 'fallback')).rejects.toMatchObject({
      message: 'fallback',
      status: 502,
    });
  });
});
