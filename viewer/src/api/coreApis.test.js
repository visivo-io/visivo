// Coverage for the non-uniform api modules: commit status/commit, project
// defaults, error, expression translation (dialect→duckdb), pre-computed model
// data, project file path, and dashboard read/save/delete/validate. Several of
// these gate on URLContext.isAvailable (dist mode has no server), so it's mocked
// as a toggle.
import { getCommitStatus, getPendingChanges, commitChanges } from './commit';
import { fetchDefaults, saveDefaults } from './defaults';
import { fetchError } from './error';
import { translateExpressions } from './expressions';
import { fetchModelData } from './modelData';
import { fetchProjectFilePath } from './projectFilePath';
import { fetchDashboard } from './dashboard';
import {
  fetchAllDashboards,
  saveDashboard,
  deleteDashboard,
  validateDashboard,
} from './dashboards';
import { apiFetch } from './utils';
import { isAvailable } from '../contexts/URLContext';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params) => `/api/${key}${params && params.name ? `/${params.name}` : ''}`,
  isAvailable: jest.fn(() => true),
}));

const ok = data => ({ status: 200, ok: true, json: async () => data });
const fail = (status, data = {}) => ({ status, ok: false, json: async () => data });

beforeEach(() => {
  apiFetch.mockReset();
  isAvailable.mockReturnValue(true);
});

describe('commit api', () => {
  it('getCommitStatus returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ hasChanges: true }));
    await expect(getCommitStatus()).resolves.toEqual({ hasChanges: true });
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(getCommitStatus()).rejects.toThrow('Failed to get commit status');
  });

  it('getPendingChanges returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ name: 'a' }]));
    await expect(getPendingChanges()).resolves.toEqual([{ name: 'a' }]);
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(getPendingChanges()).rejects.toThrow('Failed to get pending changes');
  });

  it('commitChanges POSTs and surfaces the server error message on failure', async () => {
    apiFetch.mockResolvedValueOnce(ok({ committed: 3 }));
    await expect(commitChanges()).resolves.toEqual({ committed: 3 });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' })
    );
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'nothing staged' }));
    await expect(commitChanges()).rejects.toThrow('nothing staged');
  });
});

describe('defaults api', () => {
  it('fetchDefaults scopes by project_id and returns json on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok({ source: 'duckdb' }));
    await expect(fetchDefaults('proj-1')).resolves.toEqual({ source: 'duckdb' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-1'));
  });

  it('fetchDefaults throws on a non-200', async () => {
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchDefaults()).rejects.toThrow('Failed to fetch defaults');
  });

  it('saveDefaults POSTs the config and surfaces the server error', async () => {
    apiFetch.mockResolvedValueOnce(ok({ saved: true }));
    await expect(saveDefaults({ a: 1 })).resolves.toEqual({ saved: true });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ a: 1 }) })
    );
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'bad default' }));
    await expect(saveDefaults({})).rejects.toThrow('bad default');
  });
});

describe('error api', () => {
  it('fetchError returns json on 200 and null otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ message: 'boom' }));
    await expect(fetchError()).resolves.toEqual({ message: 'boom' });
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(fetchError()).resolves.toBeNull();
  });
});

describe('expressions api', () => {
  it('falls back to identity translation when the endpoint is unavailable', async () => {
    isAvailable.mockReturnValue(false);
    const result = await translateExpressions(
      [{ name: 'x', expression: 'a + 1', type: 'metric' }],
      'snowflake'
    );
    expect(result.errors).toEqual([]);
    expect(result.translations[0].duckdb_expression).toBe('a + 1');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('POSTs the expressions and dialect when available', async () => {
    apiFetch.mockResolvedValueOnce(ok({ translations: [], errors: [] }));
    await translateExpressions([{ name: 'x', expression: 'a', type: 'metric' }], 'postgresql');
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expressions: [{ name: 'x', expression: 'a', type: 'metric' }],
          source_dialect: 'postgresql',
        }),
      })
    );
  });

  it('throws on a non-200 when available', async () => {
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(translateExpressions([], 'mysql')).rejects.toThrow(
      'Failed to translate expressions'
    );
  });
});

describe('modelData api', () => {
  it('reports unavailable without calling the server in dist mode', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchModelData('m')).resolves.toEqual({ available: false });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('returns json on 200 and the unavailable shape on a non-200', async () => {
    apiFetch.mockResolvedValueOnce(ok({ available: true, row_count: 2 }));
    await expect(fetchModelData('m')).resolves.toEqual({ available: true, row_count: 2 });
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(fetchModelData('m')).resolves.toEqual({ available: false });
  });
});

describe('projectFilePath api', () => {
  it('returns json on 200 and null otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ path: '/p.yml' }));
    await expect(fetchProjectFilePath()).resolves.toEqual({ path: '/p.yml' });
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchProjectFilePath()).resolves.toBeNull();
  });
});

describe('dashboard api', () => {
  it('fetchDashboard appends project_id and returns json when ok', async () => {
    apiFetch.mockResolvedValueOnce(ok({ name: 'd' }));
    await expect(fetchDashboard('proj-1', 'd')).resolves.toEqual({ name: 'd' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-1'));
  });

  it('fetchDashboard throws on a non-ok response', async () => {
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchDashboard('proj-1', 'd')).rejects.toThrow('Failed to fetch dashboard data: 500');
  });
});

describe('dashboards api', () => {
  it('fetchAllDashboards scopes by project_id and returns json on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ name: 'd' }]));
    await expect(fetchAllDashboards('proj-1')).resolves.toEqual([{ name: 'd' }]);
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-1'));
  });

  it('fetchAllDashboards throws on a non-200', async () => {
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchAllDashboards()).rejects.toThrow('Failed to fetch dashboards');
  });

  it('saveDashboard POSTs and surfaces the server error message', async () => {
    apiFetch.mockResolvedValueOnce(ok({ saved: true }));
    await expect(saveDashboard('d', { a: 1 })).resolves.toEqual({ saved: true });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ a: 1 }) })
    );
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'bad dashboard' }));
    await expect(saveDashboard('d', {})).rejects.toThrow('bad dashboard');
  });

  it('deleteDashboard sends DELETE and returns json on 200, throws otherwise', async () => {
    apiFetch.mockResolvedValueOnce(ok({ deleted: true }));
    await expect(deleteDashboard('d')).resolves.toEqual({ deleted: true });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' })
    );
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(deleteDashboard('d')).rejects.toThrow('Failed to delete dashboard');
  });

  it('validateDashboard returns the parsed body regardless of status', async () => {
    apiFetch.mockResolvedValueOnce(ok({ valid: false, errors: ['x'] }));
    await expect(validateDashboard('d', {})).resolves.toEqual({ valid: false, errors: ['x'] });
  });
});
