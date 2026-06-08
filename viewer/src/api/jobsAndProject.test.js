// Coverage for project CRUD, the input/insight job fetchers (retry + structure
// validation), and the model-query job lifecycle (start/status/cancel/poll).
// These modules log diagnostics through console.{debug,warn,error}; the test
// harness rejects unexpected console.warn/error, so they're silenced here.
import {
  fetchProjectBlob,
  fetchAllProjects,
  fetchProject,
  saveProject,
  deleteProject,
  validateProject,
} from './project';
import { fetchInputJobs, loadInputJobData } from './inputJobs';
import { fetchInsightJobs } from './insightJobs';
import {
  startModelQueryJob,
  getModelQueryJobStatus,
  cancelModelQueryJob,
  pollModelQueryJob,
} from './modelQueryJobs';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  // Append any param values (name / jobId / sourceName) onto the path.
  getUrl: (key, params) => `/api/${key}${params ? `/${Object.values(params).join('/')}` : ''}`,
}));
jest.mock('../contexts/URLContext.jsx', () => ({
  getUrl: (key, params) => `/api/${key}${params ? `/${Object.values(params).join('/')}` : ''}`,
}));

global.console.debug = jest.fn();
global.console.warn = jest.fn();
global.console.error = jest.fn();

const res = (status, data) => ({
  status,
  ok: status < 400,
  json: async () => data,
  text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});
const ok = data => res(200, data);
const fail = (status, data = {}) => res(status, data);

beforeEach(() => apiFetch.mockReset());

describe('project api', () => {
  it('fetchProjectBlob scopes by project_id, returns json on 200, null otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ tree: {} }));
    await expect(fetchProjectBlob('proj-1')).resolves.toEqual({ tree: {} });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-1'));
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchProjectBlob()).resolves.toBeNull();
  });

  it('fetchAllProjects returns json on 200 and never scopes by project_id', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ id: 'p' }]));
    await expect(fetchAllProjects()).resolves.toEqual([{ id: 'p' }]);
    expect(apiFetch).toHaveBeenCalledWith(expect.not.stringContaining('project_id'));
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchAllProjects()).rejects.toThrow('Failed to fetch projects');
  });

  it('fetchProject returns json (200), null (404), throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ id: 'p', name: 'p' }));
    await expect(fetchProject('p')).resolves.toEqual({ id: 'p', name: 'p' });
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(fetchProject('p')).resolves.toBeNull();
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchProject('p')).rejects.toThrow('Failed to fetch project: p');
  });

  it('saveProject POSTs the config and surfaces the server error message', async () => {
    apiFetch.mockResolvedValueOnce(ok({ saved: true }));
    await expect(saveProject('p', { a: 1 })).resolves.toEqual({ saved: true });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ a: 1 }) })
    );
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'bad project' }));
    await expect(saveProject('p', {})).rejects.toThrow('bad project');
  });

  it('deleteProject sends DELETE and returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ deleted: true }));
    await expect(deleteProject('p')).resolves.toEqual({ deleted: true });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' })
    );
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(deleteProject('p')).rejects.toThrow('Failed to delete project from cache');
  });

  it('validateProject returns the parsed body regardless of status', async () => {
    apiFetch.mockResolvedValueOnce(ok({ valid: true }));
    await expect(validateProject('p', {})).resolves.toEqual({ valid: true });
  });
});

describe('inputJobs api', () => {
  const validInput = {
    name: 'a',
    type: 'single-select',
    structure: 'options',
    files: [{ name_hash: 'h', signed_data_file_url: 'u' }],
  };

  it('returns [] without calling the server when no names are requested', async () => {
    await expect(fetchInputJobs('proj-1', [])).resolves.toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('passes input names + project_id and filters to requested, valid inputs', async () => {
    const other = { ...validInput, name: 'b' };
    const invalid = { name: 'a-bad' }; // requested-ish but structurally invalid
    apiFetch.mockResolvedValueOnce(ok([validInput, other, invalid]));
    await expect(fetchInputJobs('proj-1', ['a'])).resolves.toEqual([validInput]);
    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain('input_names=a');
    expect(url).toContain('project_id=proj-1');
  });

  it('throws after exhausting retries on a non-ok response', async () => {
    apiFetch.mockResolvedValueOnce(fail(500, 'boom'));
    await expect(fetchInputJobs('proj-1', ['a'], 1)).rejects.toThrow(
      /Failed to fetch input jobs after 1 attempts/
    );
  });

  it('loadInputJobData returns json when ok and throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ options: [1, 2] }));
    await expect(loadInputJobData('http://x/data.json')).resolves.toEqual({ options: [1, 2] });
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(loadInputJobData('http://x/data.json')).rejects.toThrow(
      'Failed to fetch input job JSON: 404'
    );
  });
});

describe('insightJobs api', () => {
  const validInsight = {
    name: 'a',
    files: [{ name_hash: 'h', signed_data_file_url: 'u' }],
    query: 'SELECT 1',
    props_mapping: { x: 'y' },
  };

  it('returns [] without calling the server when no names are requested', async () => {
    await expect(fetchInsightJobs('proj-1', [])).resolves.toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('passes insight names + project_id and returns valid jobs', async () => {
    apiFetch.mockResolvedValueOnce(ok([validInsight]));
    await expect(fetchInsightJobs('proj-1', ['a'])).resolves.toEqual([validInsight]);
    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain('insight_names=a');
    expect(url).toContain('project_id=proj-1');
  });

  it('appends run_id only when it differs from the default', async () => {
    apiFetch.mockResolvedValueOnce(ok([validInsight]));
    await fetchInsightJobs('proj-1', ['a'], 'custom-run');
    expect(apiFetch.mock.calls[0][0]).toContain('run_id=custom-run');
  });

  it('throws after exhausting retries when the server returns no valid jobs', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ name: 'a' }])); // missing files/query/props_mapping
    await expect(fetchInsightJobs('proj-1', ['a'], undefined, 1)).rejects.toThrow(
      /Failed to fetch insight jobs after 1 attempts/
    );
  });
});

describe('modelQueryJobs api', () => {
  it('startModelQueryJob POSTs source_name + sql and returns json', async () => {
    apiFetch.mockResolvedValueOnce(ok({ job_id: 'j1', status: 'running' }));
    await expect(startModelQueryJob('src', 'SELECT 1')).resolves.toEqual({
      job_id: 'j1',
      status: 'running',
    });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ source_name: 'src', sql: 'SELECT 1' }),
      })
    );
  });

  it('startModelQueryJob surfaces the server error on a non-ok response', async () => {
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'bad sql' }));
    await expect(startModelQueryJob('src', 'oops')).rejects.toThrow('bad sql');
  });

  it('getModelQueryJobStatus returns json and throws on non-ok', async () => {
    apiFetch.mockResolvedValueOnce(ok({ status: 'running' }));
    await expect(getModelQueryJobStatus('j1')).resolves.toEqual({ status: 'running' });
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(getModelQueryJobStatus('j1')).rejects.toThrow(/Failed to get job status/);
  });

  it('cancelModelQueryJob sends DELETE and returns json, throws on non-ok', async () => {
    apiFetch.mockResolvedValueOnce(ok({ message: 'cancelled', job_id: 'j1' }));
    await expect(cancelModelQueryJob('j1')).resolves.toEqual({
      message: 'cancelled',
      job_id: 'j1',
    });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' })
    );
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(cancelModelQueryJob('j1')).rejects.toThrow(/Failed to cancel job/);
  });

  it('pollModelQueryJob resolves on completion and reports progress', async () => {
    const onProgress = jest.fn();
    apiFetch.mockResolvedValueOnce(ok({ status: 'completed', rows: [] }));
    await expect(pollModelQueryJob('j1', { onProgress })).resolves.toEqual({
      status: 'completed',
      rows: [],
    });
    expect(onProgress).toHaveBeenCalledWith({ status: 'completed', rows: [] });
  });

  it('pollModelQueryJob throws with the job error when it fails', async () => {
    apiFetch.mockResolvedValueOnce(ok({ status: 'failed', error: 'query exploded' }));
    await expect(pollModelQueryJob('j1')).rejects.toThrow('query exploded');
  });
});
