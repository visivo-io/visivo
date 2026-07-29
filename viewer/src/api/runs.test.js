// Coverage for the run API (api/runs.js). apiFetch + getUrl are mocked; getUrl
// echoes the key + id so the endpoint hit — and, for writes, the method and body
// — can be asserted. fetchRuns/fetchRunLog moved here from branching.test.js
// with the code; triggerRun and cancelRun are covered here for the first time.
import { fetchRuns, triggerRun, fetchRunLog, cancelRun } from './runs';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params = {}) => `/api/${key}/${params.projectId ?? params.runId ?? ''}`,
}));

const REJECT = Symbol('reject');
const res = (status, body = {}) => ({
  status,
  json: async () => {
    if (body === REJECT) throw new SyntaxError('Unexpected end of JSON input');
    return body;
  },
});

beforeEach(() => apiFetch.mockReset());

describe('fetchRuns', () => {
  it('returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(res(200, [{ id: 'r1' }]));
    await expect(fetchRuns('p1')).resolves.toEqual([{ id: 'r1' }]);
    expect(apiFetch).toHaveBeenCalledWith('/api/projectRun/p1');

    apiFetch.mockResolvedValueOnce(res(503));
    await expect(fetchRuns('p1')).rejects.toThrow('Failed to fetch runs');
  });
});

describe('fetchRunLog', () => {
  it('hits the run-scoped endpoint, returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { state: 'running', logs: 'x' }));
    await expect(fetchRunLog('run-9')).resolves.toEqual({ state: 'running', logs: 'x' });
    expect(apiFetch).toHaveBeenCalledWith('/api/runLogs/run-9');

    apiFetch.mockResolvedValueOnce(res(404));
    await expect(fetchRunLog('run-9')).rejects.toThrow('Failed to fetch run log');
  });
});

describe('triggerRun', () => {
  const bodyOf = () => JSON.parse(apiFetch.mock.calls[0][1].body);

  it('POSTs with NO dag_filter key by default — "build what is staged"', async () => {
    // Absent and empty are different requests to the server: absent scopes the
    // run to the staged set, empty means rebuild everything. Collapsing them
    // would silently turn every button press into a full rebuild.
    apiFetch.mockResolvedValueOnce(res(201, { id: 'r1' }));
    await triggerRun('p1');
    expect(apiFetch).toHaveBeenCalledWith('/api/projectRun/p1', expect.objectContaining({ method: 'POST' }));
    expect(bodyOf()).toEqual({});
  });

  it('sends an explicit empty dag_filter when asked to run everything', async () => {
    apiFetch.mockResolvedValueOnce(res(201, { id: 'r1' }));
    await triggerRun('p1', { dagFilter: '' });
    expect(bodyOf()).toEqual({ dag_filter: '' });
  });

  it('passes a scoped filter through', async () => {
    apiFetch.mockResolvedValueOnce(res(201, { id: 'r1' }));
    await triggerRun('p1', { dagFilter: '+db+' });
    expect(bodyOf()).toEqual({ dag_filter: '+db+' });
  });

  it('returns the raw status and body rather than throwing on 409', async () => {
    // "a run is already in flight" is a state the Run view renders, not an error.
    apiFetch.mockResolvedValueOnce(res(409, { action: 'run_in_progress' }));
    await expect(triggerRun('p1')).resolves.toEqual({
      status: 409,
      body: { action: 'run_in_progress' },
    });
  });

  it('survives a non-JSON body', async () => {
    apiFetch.mockResolvedValueOnce(res(500, REJECT));
    await expect(triggerRun('p1')).resolves.toEqual({ status: 500, body: null });
  });
});

describe('cancelRun', () => {
  it('POSTs to the run-scoped cancel endpoint', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { state: 'canceled' }));
    await expect(cancelRun('run-9')).resolves.toEqual({
      status: 200,
      body: { state: 'canceled' },
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/runCancel/run-9', { method: 'POST' });
  });

  it('reports a 409 rather than throwing', async () => {
    // The run reached a terminal state between render and click; a refetch will
    // show that, so there is nothing to shout about.
    apiFetch.mockResolvedValueOnce(res(409, { detail: 'already finished' }));
    await expect(cancelRun('run-9')).resolves.toEqual({
      status: 409,
      body: { detail: 'already finished' },
    });
  });

  it('survives a non-JSON body', async () => {
    apiFetch.mockResolvedValueOnce(res(502, REJECT));
    await expect(cancelRun('run-9')).resolves.toEqual({ status: 502, body: null });
  });
});
