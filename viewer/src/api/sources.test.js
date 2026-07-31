// Coverage for the async test-connection contract in api/sources.js.
//
// The op is asynchronous on both servers: POST answers 202 {job_id}, then the
// job is polled at <path><job_id>/. Cloud has no alternative — the test runs on
// a warm runner pool whose pods deny all ingress — and the local server matches
// so there is one code path.
//
// The point of these is the RETURN SHAPE: it is unchanged by the conversion, so
// sourceStore/SourceEditForm/SourceEditorModal needed no edit.
import { testSourceConnection } from './sources';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => `/api/${key}/`,
}));

const accepted = jobId => ({ status: 202, json: async () => ({ job_id: jobId }) });
const polled = body => ({ status: 200, json: async () => body });

beforeEach(() => apiFetch.mockReset());

describe('testSourceConnection', () => {
  it('POSTs the config, then polls the job to its result', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-1'))
      .mockResolvedValueOnce(polled({ status: 'queued' }))
      .mockResolvedValueOnce(polled({ status: 'running' }))
      .mockResolvedValueOnce(
        polled({ status: 'completed', result: { source: 'db', status: 'connected' } })
      );

    await expect(testSourceConnection({ name: 'db' })).resolves.toEqual({
      source: 'db',
      status: 'connected',
    });

    const [startUrl, options] = apiFetch.mock.calls[0];
    expect(startUrl).toBe('/api/sourceTestConnection/');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ name: 'db' });
    // The job hangs off the same path the start request used.
    expect(apiFetch).toHaveBeenLastCalledWith('/api/sourceTestConnection/job-1/');
  });

  it('reports a refused connection in the shape the form renders', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-2'))
      .mockResolvedValueOnce(polled({ status: 'failed', error: 'auth failed' }));

    await expect(testSourceConnection({ name: 'db' })).resolves.toEqual({
      status: 'connection_failed',
      error: 'auth failed',
    });
  });

  it('reports a cancelled job rather than spinning on it', async () => {
    // The cloud reaper cancels a job no worker ever claimed.
    apiFetch
      .mockResolvedValueOnce(accepted('job-3'))
      .mockResolvedValueOnce(polled({ status: 'cancelled' }));

    await expect(testSourceConnection({ name: 'db' })).resolves.toEqual({
      status: 'connection_failed',
      error: 'Job cancelled',
    });
  });

  it('surfaces a rejected request without minting a job', async () => {
    // A malformed config is refused inline; there is nothing to poll.
    apiFetch.mockResolvedValueOnce({
      status: 400,
      json: async () => ({ error: 'Source configuration is required' }),
    });

    await expect(testSourceConnection({})).resolves.toEqual({
      status: 'connection_failed',
      error: 'Source configuration is required',
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic message when the rejection carries no reason', async () => {
    apiFetch.mockResolvedValueOnce({ status: 500, json: async () => ({}) });

    await expect(testSourceConnection({ name: 'db' })).resolves.toEqual({
      status: 'connection_failed',
      error: 'Server rejected the request',
    });
  });

  it('reports a poll that stops answering', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-4'))
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) });

    await expect(testSourceConnection({ name: 'db' })).resolves.toEqual({
      status: 'connection_failed',
      error: 'Lost track of the job',
    });
  });
});
