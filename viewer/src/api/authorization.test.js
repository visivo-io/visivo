/**
 * "Authorized" as one idea (VIS-1377).
 *
 * The Agent tab and Deploy both ask this, through here, so there is one answer
 * rather than two that drift.
 */
import {
  authorizationProgress,
  fetchAuthorization,
  startAuthorization,
} from './authorization';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

const answers = (status, body) => ({ status, json: async () => body });

beforeEach(() => jest.clearAllMocks());

describe('fetchAuthorization', () => {
  it('reports what the server said', async () => {
    apiFetch.mockResolvedValue(answers(200, { authorized: true, host: 'https://app.visivo.io' }));

    expect(await fetchAuthorization()).toEqual({
      authorized: true,
      host: 'https://app.visivo.io',
    });
  });

  it('coerces a missing answer to unauthorized rather than undefined', async () => {
    apiFetch.mockResolvedValue(answers(200, {}));

    expect(await fetchAuthorization()).toEqual({ authorized: false, host: null });
  });

  it('asks with a GET, because it is a question', async () => {
    apiFetch.mockResolvedValue(answers(200, { authorized: false }));

    await fetchAuthorization();

    // One argument: no method, so the default GET.
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/status/');
  });

  it('throws when it cannot be read, so a caller can decide what that means', async () => {
    apiFetch.mockResolvedValue(answers(500, {}));

    await expect(fetchAuthorization()).rejects.toThrow();
  });
});

describe('startAuthorization', () => {
  it('returns the id to poll and the URL to open', async () => {
    apiFetch.mockResolvedValue(answers(200, { auth_id: 'a1', full_url: 'https://app/x' }));

    expect(await startAuthorization()).toEqual({ authId: 'a1', url: 'https://app/x' });
  });

  it('throws rather than opening nothing', async () => {
    apiFetch.mockResolvedValue(answers(500, {}));

    await expect(startAuthorization()).rejects.toThrow();
  });
});

describe('authorizationProgress', () => {
  it('reads 200 as done', async () => {
    apiFetch.mockResolvedValue(answers(200, { status: 200, message: 'Authenticated' }));

    expect(await authorizationProgress('a1')).toEqual({
      done: true,
      failed: false,
      message: 'Authenticated',
    });
  });

  it('reads a refusal as failed, not as still working', async () => {
    apiFetch.mockResolvedValue(answers(200, { status: 401, message: 'UnAuthorized access' }));

    const progress = await authorizationProgress('a1');
    expect(progress.failed).toBe(true);
    expect(progress.done).toBe(false);
  });

  it('reads anything else as still in flight', async () => {
    apiFetch.mockResolvedValue(answers(200, { status: 202, message: 'Authenticating ...' }));

    const progress = await authorizationProgress('a1');
    expect(progress.done).toBe(false);
    expect(progress.failed).toBe(false);
  });
});
