/**
 * Commit API (Dashboard Building v1 / Q14 rollback surface).
 *
 * Each helper resolves its endpoint via URLContext and either returns the
 * parsed JSON on 200 or throws. commitChanges/discardChanges additionally
 * surface the server's `error` message when the failure body is parseable,
 * and fall back to a generic message when it is not.
 */
import {
  getCommitStatus,
  getPendingChanges,
  commitChanges,
  discardChanges,
  discardObjectChanges,
} from './commit';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => `/api/${key}/`,
}));

const ok = data => ({ status: 200, json: async () => data });
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

describe('getCommitStatus', () => {
  it('returns the parsed status payload on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok({ has_changes: true, count: 2 }));
    await expect(getCommitStatus()).resolves.toEqual({ has_changes: true, count: 2 });
    expect(apiFetch).toHaveBeenCalledWith('/api/commitStatus/');
  });

  it('throws a stable message on non-200', async () => {
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(getCommitStatus()).rejects.toThrow('Failed to get commit status');
  });
});

describe('getPendingChanges', () => {
  it('returns the pending-change list on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ name: 'model_a', status: 'MODIFIED' }]));
    await expect(getPendingChanges()).resolves.toEqual([{ name: 'model_a', status: 'MODIFIED' }]);
    expect(apiFetch).toHaveBeenCalledWith('/api/commitPending/');
  });

  it('throws a stable message on non-200', async () => {
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(getPendingChanges()).rejects.toThrow('Failed to get pending changes');
  });
});

describe('commitChanges', () => {
  it('POSTs JSON to the commit endpoint and returns the result', async () => {
    apiFetch.mockResolvedValueOnce(ok({ committed: 3 }));
    await expect(commitChanges()).resolves.toEqual({ committed: 3 });
    expect(apiFetch).toHaveBeenCalledWith('/api/commit/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('surfaces the server error message on failure', async () => {
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'nothing staged' }));
    await expect(commitChanges()).rejects.toThrow('nothing staged');
  });

  it('falls back to a generic message when the failure body has no error key', async () => {
    apiFetch.mockResolvedValueOnce(fail(500, { detail: 'oops' }));
    await expect(commitChanges()).rejects.toThrow('Failed to commit changes');
  });

  it('falls back to a generic message when the failure body is unparseable', async () => {
    apiFetch.mockResolvedValueOnce(failUnparseable(500));
    await expect(commitChanges()).rejects.toThrow('Failed to commit changes');
  });
});

describe('discardChanges', () => {
  it('POSTs JSON to the discard endpoint and returns the result', async () => {
    apiFetch.mockResolvedValueOnce(ok({ discarded: 5 }));
    await expect(discardChanges()).resolves.toEqual({ discarded: 5 });
    expect(apiFetch).toHaveBeenCalledWith('/api/commitDiscard/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('surfaces the server error message on failure', async () => {
    apiFetch.mockResolvedValueOnce(fail(409, { error: 'draft is locked' }));
    await expect(discardChanges()).rejects.toThrow('draft is locked');
  });

  it('falls back to a generic message when the failure body is unparseable', async () => {
    apiFetch.mockResolvedValueOnce(failUnparseable(500));
    await expect(discardChanges()).rejects.toThrow('Failed to discard changes');
  });
});

describe('discardObjectChanges', () => {
  it('POSTs JSON to the per-object discard endpoint and returns the result', async () => {
    apiFetch.mockResolvedValueOnce(ok({ name: 'orders', type: 'model' }));
    await expect(discardObjectChanges('model', 'orders')).resolves.toEqual({
      name: 'orders',
      type: 'model',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/commitDiscardObject/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('surfaces the server error message on failure', async () => {
    apiFetch.mockResolvedValueOnce(fail(404, { error: 'no pending changes to discard' }));
    await expect(discardObjectChanges('chart', 'ghost')).rejects.toThrow(
      'no pending changes to discard'
    );
  });

  it('falls back to a per-object message when the failure body is unparseable', async () => {
    apiFetch.mockResolvedValueOnce(failUnparseable(500));
    await expect(discardObjectChanges('model', 'orders')).rejects.toThrow(
      "Failed to discard changes to model 'orders'"
    );
  });
});
