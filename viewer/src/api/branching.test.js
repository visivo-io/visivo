// Coverage for the branching API (api/branching.js): the cloud-editing
// draft / branch / discard / changes / runs / run-log / commit endpoints.
// apiFetch + getUrl are mocked; getUrl echoes the key + id so we can assert the
// endpoint hit and (for writes) the method/body. Each function's success,
// error, and edge (non-JSON body) paths are exercised.
import {
  fetchCapabilities,
  createDraft,
  createBranch,
  discardDraft,
  fetchChanges,
  fetchRuns,
  fetchRunLog,
  commitDraft,
} from './branching';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params = {}) => `/api/${key}/${params.projectId ?? params.runId ?? ''}`,
}));

// A fake Response: a status + a json() that resolves to `body`, or rejects when
// `body` is the REJECT sentinel (to exercise the `.json().catch(() => ({}))`).
const REJECT = Symbol('reject');
const res = (status, body = {}) => ({
  status,
  json: async () => {
    if (body === REJECT) throw new SyntaxError('Unexpected end of JSON input');
    return body;
  },
});

beforeEach(() => {
  apiFetch.mockReset();
});

describe('fetchCapabilities', () => {
  it('returns the capabilities json on 200', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { can_edit: true }));
    await expect(fetchCapabilities('p1')).resolves.toEqual({ can_edit: true });
    expect(apiFetch).toHaveBeenCalledWith('/api/projectCapabilities/p1');
  });

  it('returns null on 404 (local serve has no such endpoint)', async () => {
    apiFetch.mockResolvedValueOnce(res(404));
    await expect(fetchCapabilities('p1')).resolves.toBeNull();
  });

  it('throws on any other status', async () => {
    apiFetch.mockResolvedValueOnce(res(500));
    await expect(fetchCapabilities('p1')).rejects.toThrow('Failed to fetch project capabilities');
  });
});

describe('createDraft', () => {
  it('returns the draft envelope on 200 and 201', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { id: 'd1' }));
    await expect(createDraft('p1')).resolves.toEqual({ id: 'd1' });
    apiFetch.mockResolvedValueOnce(res(201, { id: 'd2' }));
    await expect(createDraft('p1')).resolves.toEqual({ id: 'd2' });
  });

  it('POSTs to the draft endpoint with a JSON content-type', async () => {
    apiFetch.mockResolvedValueOnce(res(201, { id: 'd1' }));
    await createDraft('p1');
    expect(apiFetch).toHaveBeenCalledWith('/api/projectDraft/p1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('throws the server detail, then error, then a default', async () => {
    apiFetch.mockResolvedValueOnce(res(403, { detail: 'no permission' }));
    await expect(createDraft('p1')).rejects.toThrow('no permission');
    apiFetch.mockResolvedValueOnce(res(500, { error: 'boom' }));
    await expect(createDraft('p1')).rejects.toThrow('boom');
    apiFetch.mockResolvedValueOnce(res(500, REJECT));
    await expect(createDraft('p1')).rejects.toThrow('Failed to create draft');
  });
});

describe('createBranch', () => {
  it('returns the branch envelope on 201 and sends new_stage_name', async () => {
    apiFetch.mockResolvedValueOnce(res(201, { id: 'b1' }));
    await expect(createBranch({ projectId: 'p1', newStageName: 'feature-x' })).resolves.toEqual({
      id: 'b1',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/projectBranch/p1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_stage_name: 'feature-x' }),
    });
  });

  it('throws errors, then detail, then a default', async () => {
    apiFetch.mockResolvedValueOnce(res(422, { errors: 'name taken' }));
    await expect(createBranch({ projectId: 'p1', newStageName: 'x' })).rejects.toThrow(
      'name taken',
    );
    apiFetch.mockResolvedValueOnce(res(403, { detail: 'denied' }));
    await expect(createBranch({ projectId: 'p1', newStageName: 'x' })).rejects.toThrow('denied');
    apiFetch.mockResolvedValueOnce(res(500, REJECT));
    await expect(createBranch({ projectId: 'p1', newStageName: 'x' })).rejects.toThrow(
      'Failed to create branch',
    );
  });
});

describe('discardDraft', () => {
  it('returns true on 204 and 200 and DELETEs the discard endpoint', async () => {
    apiFetch.mockResolvedValueOnce(res(204));
    await expect(discardDraft('d1')).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledWith('/api/projectDiscard/d1', { method: 'DELETE' });
    apiFetch.mockResolvedValueOnce(res(200));
    await expect(discardDraft('d1')).resolves.toBe(true);
  });

  it('throws the server detail, falling back to a default', async () => {
    apiFetch.mockResolvedValueOnce(res(409, { detail: 'cannot discard' }));
    await expect(discardDraft('d1')).rejects.toThrow('cannot discard');
    apiFetch.mockResolvedValueOnce(res(500, REJECT));
    await expect(discardDraft('d1')).rejects.toThrow('Failed to discard draft');
  });
});

describe('read endpoints', () => {
  it('fetchChanges returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { has_changes: true }));
    await expect(fetchChanges('p1')).resolves.toEqual({ has_changes: true });
    expect(apiFetch).toHaveBeenCalledWith('/api/projectChanges/p1');
    apiFetch.mockResolvedValueOnce(res(500));
    await expect(fetchChanges('p1')).rejects.toThrow('Failed to fetch changes');
  });

  it('fetchRuns returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(res(200, [{ id: 'r1' }]));
    await expect(fetchRuns('p1')).resolves.toEqual([{ id: 'r1' }]);
    expect(apiFetch).toHaveBeenCalledWith('/api/projectRun/p1');
    apiFetch.mockResolvedValueOnce(res(503));
    await expect(fetchRuns('p1')).rejects.toThrow('Failed to fetch runs');
  });

  it('fetchRunLog hits the run-scoped endpoint, returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { state: 'running', logs: 'x' }));
    await expect(fetchRunLog('run-9')).resolves.toEqual({ state: 'running', logs: 'x' });
    expect(apiFetch).toHaveBeenCalledWith('/api/runLogs/run-9');
    apiFetch.mockResolvedValueOnce(res(404));
    await expect(fetchRunLog('run-9')).rejects.toThrow('Failed to fetch run log');
  });
});

describe('commitDraft', () => {
  it('returns {status, body} without throwing on success', async () => {
    apiFetch.mockResolvedValueOnce(res(201, { commit_id: 'c1' }));
    await expect(commitDraft('p1', 'msg')).resolves.toEqual({
      status: 201,
      body: { commit_id: 'c1' },
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/projectCommit/p1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'msg' }),
    });
  });

  it('defaults the message to an empty string', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { committed: false }));
    await commitDraft('p1');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projectCommit/p1',
      expect.objectContaining({ body: JSON.stringify({ message: '' }) }),
    );
  });

  it('surfaces the gate status/body instead of throwing (e.g. 409 run_required)', async () => {
    apiFetch.mockResolvedValueOnce(res(409, { action: 'run_required' }));
    await expect(commitDraft('p1')).resolves.toEqual({
      status: 409,
      body: { action: 'run_required' },
    });
  });

  it('tolerates a non-JSON body (returns {})', async () => {
    apiFetch.mockResolvedValueOnce(res(500, REJECT));
    await expect(commitDraft('p1')).resolves.toEqual({ status: 500, body: {} });
  });
});
