// Coverage for the source-schema job module: availability gating (dist mode has
// no server), cached-schema reads, on-demand generation + status, the
// fetch-or-generate orchestration, and table/column listing with 404→empty
// semantics. Error bodies are parsed as JSON {message} or plain text.
import {
  fetchSourceSchemaJobs,
  fetchSourceSchema,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
  fetchOrGenerateSchema,
  fetchSourceTables,
  fetchTableColumns,
} from './sourceSchemaJobs';
import { apiFetch } from './utils';
import { isAvailable } from '../contexts/URLContext';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params) => `/api/${key}${params ? `/${Object.values(params).join('/')}` : ''}`,
  isAvailable: jest.fn(() => true),
}));

global.console.warn = jest.fn();

const res = (status, data) => ({
  status,
  ok: status < 400,
  json: async () => data,
  text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});
const ok = data => res(200, data);
const fail = (status, data = {}) => res(status, data);

beforeEach(() => {
  apiFetch.mockReset();
  isAvailable.mockReturnValue(true);
});

describe('fetchSourceSchemaJobs', () => {
  it('returns [] without a request when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchSourceSchemaJobs()).resolves.toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('returns json on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ name: 'src' }]));
    await expect(fetchSourceSchemaJobs()).resolves.toEqual([{ name: 'src' }]);
  });

  it('throws with the parsed JSON message on a non-ok response', async () => {
    apiFetch.mockResolvedValueOnce(fail(500, { message: 'db down' }));
    await expect(fetchSourceSchemaJobs()).rejects.toThrow('Loading sources failed (500): db down');
  });

  it('wraps a thrown fetch with server-unreachable context', async () => {
    apiFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(fetchSourceSchemaJobs()).rejects.toThrow(/server unreachable/);
  });
});

describe('fetchSourceSchema', () => {
  it('returns null when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchSourceSchema('src')).resolves.toBeNull();
  });

  it('appends run_id, returns json on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok({ columns: [] }));
    await expect(fetchSourceSchema('src', 'preview-src')).resolves.toEqual({ columns: [] });
    expect(apiFetch.mock.calls[0][0]).toContain('run_id=preview-src');
  });

  it('returns null on 404 and throws on other errors', async () => {
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(fetchSourceSchema('src')).resolves.toBeNull();
    apiFetch.mockResolvedValueOnce(fail(500, 'kaboom'));
    await expect(fetchSourceSchema('src')).rejects.toThrow(/Loading schema for 'src' failed \(500\)/);
  });
});

describe('generateSourceSchema', () => {
  it('throws when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(generateSourceSchema('src')).rejects.toThrow('not available in this environment');
  });

  it('POSTs the source config and returns json', async () => {
    apiFetch.mockResolvedValueOnce(ok({ run_id: 'r1' }));
    await expect(generateSourceSchema('src')).resolves.toEqual({ run_id: 'r1' });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ config: { source_name: 'src' }, run: true }),
      })
    );
  });

  it('throws on a non-ok response', async () => {
    apiFetch.mockResolvedValueOnce(fail(500, { message: 'no can do' }));
    await expect(generateSourceSchema('src')).rejects.toThrow(/Generating schema for 'src' failed/);
  });
});

describe('fetchSchemaGenerationStatus', () => {
  it('throws when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchSchemaGenerationStatus('r1')).rejects.toThrow('not available');
  });

  it('returns json on 200 and throws on non-ok', async () => {
    apiFetch.mockResolvedValueOnce(ok({ status: 'running', progress: 0.5 }));
    await expect(fetchSchemaGenerationStatus('r1')).resolves.toEqual({
      status: 'running',
      progress: 0.5,
    });
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchSchemaGenerationStatus('r1')).rejects.toThrow(/status check failed/);
  });
});

describe('fetchOrGenerateSchema', () => {
  it('returns the cached schema and reports completion without generating', async () => {
    const onProgress = jest.fn();
    apiFetch.mockResolvedValueOnce(ok({ columns: ['a'] })); // cached fetchSourceSchema
    await expect(fetchOrGenerateSchema('src', { onProgress })).resolves.toEqual({
      columns: ['a'],
    });
    expect(onProgress).toHaveBeenCalledWith('completed', 1.0, 'Using cached schema');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('generates then surfaces a failed generation status', async () => {
    apiFetch
      .mockResolvedValueOnce(fail(404)) // no cached schema
      .mockResolvedValueOnce(ok({ run_id: 'r1' })) // generateSourceSchema
      .mockResolvedValueOnce(ok({ status: 'failed', error: 'introspection blew up' })); // status poll
    await expect(fetchOrGenerateSchema('src')).rejects.toThrow('introspection blew up');
  });
});

describe('fetchSourceTables', () => {
  it('returns [] when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchSourceTables('src')).resolves.toEqual([]);
  });

  it('appends search + run_id, returns json on 200', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ name: 't1' }]));
    await expect(fetchSourceTables('src', { search: 'ord', runId: 'main' })).resolves.toEqual([
      { name: 't1' },
    ]);
    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain('search=ord');
    expect(url).toContain('run_id=main');
  });

  it('returns [] on 404 and throws on other errors', async () => {
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(fetchSourceTables('src')).resolves.toEqual([]);
    apiFetch.mockResolvedValueOnce(fail(500));
    await expect(fetchSourceTables('src')).rejects.toThrow(/Loading tables for 'src' failed/);
  });
});

describe('fetchTableColumns', () => {
  it('returns [] when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchTableColumns('src', 't1')).resolves.toEqual([]);
  });

  it('returns json on 200 and [] on 404', async () => {
    apiFetch.mockResolvedValueOnce(ok([{ name: 'col' }]));
    await expect(fetchTableColumns('src', 't1', { search: 'id' })).resolves.toEqual([
      { name: 'col' },
    ]);
    expect(apiFetch.mock.calls[0][0]).toContain('search=id');
    apiFetch.mockResolvedValueOnce(fail(404));
    await expect(fetchTableColumns('src', 't1')).resolves.toEqual([]);
  });

  it('throws on a non-404 error', async () => {
    apiFetch.mockResolvedValueOnce(fail(500, { message: 'bad table' }));
    await expect(fetchTableColumns('src', 't1')).rejects.toThrow(
      /Loading columns for 'src\.t1' failed \(500\): bad table/
    );
  });
});
