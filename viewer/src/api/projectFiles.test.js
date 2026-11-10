import {
  importProjectFile,
  inspectProjectFile,
  listProjectFiles,
  ProjectFileError,
  uploadProjectFile,
} from './projectFiles';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params = {}) =>
    ({
      projectFiles: '/api/project-files/',
      projectFileUploads: '/api/project-files/uploads/',
      projectFileUploadComplete: `/api/project-files/uploads/${params.uploadId}/complete/`,
      projectFileImports: '/api/project-file-imports/',
      projectFileImportJob: `/api/project-file-imports/${params.jobId}/`,
    })[key],
}));

const respond = (status, data = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => data,
});

const fileVersion = {
  path: 'files/sales_q3.csv',
  filename: 'sales_q3.csv',
  original_filename: 'Sales Q3.csv',
  version_id: 'fv_1',
  format: 'csv',
  size: 5,
  sha256: 'abc',
  created_at: '2026-11-10T21:04:11Z',
};

beforeEach(() => apiFetch.mockReset());

describe('listProjectFiles', () => {
  it('asks for the given extensions in the project', async () => {
    apiFetch.mockResolvedValueOnce(respond(200, { files: [], formats: [], max_bytes: 100 }));

    const result = await listProjectFiles({ extensions: ['csv', 'xlsx'], projectId: 'p1' });

    expect(result.max_bytes).toBe(100);
    expect(apiFetch).toHaveBeenCalledWith('/api/project-files/?ext=csv%2Cxlsx&project_id=p1');
  });

  it("throws the server's sentence and code", async () => {
    apiFetch.mockResolvedValueOnce(
      respond(501, { error: 'Not available yet (VIS-1283).', code: 'not_implemented' })
    );

    const error = await listProjectFiles().catch(e => e);

    expect(error).toBeInstanceOf(ProjectFileError);
    expect(error.message).toBe('Not available yet (VIS-1283).');
    expect(error.code).toBe('not_implemented');
    expect(error.status).toBe(501);
  });
});

describe('uploadProjectFile', () => {
  const file = new File(['a,b\n'], 'Sales Q3.csv', { type: 'text/csv' });

  it('reserves, sends the bytes to the transfer URL and completes', async () => {
    apiFetch
      .mockResolvedValueOnce(
        respond(201, {
          upload_id: 'up_1',
          version_id: 'fv_1',
          path: 'files/sales_q3.csv',
          transfer: {
            method: 'PUT',
            url: 'https://storage.example/signed',
            headers: { 'Content-Type': 'text/csv' },
          },
        })
      )
      .mockResolvedValueOnce(respond(200))
      .mockResolvedValueOnce(respond(200, { file: fileVersion }));

    const result = await uploadProjectFile(file, { sha256: 'abc', projectId: 'p1' });

    expect(result).toEqual(fileVersion);
    const [reserve, send, complete] = apiFetch.mock.calls;
    expect(reserve[0]).toBe('/api/project-files/uploads/?project_id=p1');
    expect(JSON.parse(reserve[1].body)).toEqual({
      filename: 'Sales Q3.csv',
      size: file.size,
      content_type: 'text/csv',
      sha256: 'abc',
    });
    expect(send[0]).toBe('https://storage.example/signed');
    expect(send[1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'text/csv' },
      body: file,
    });
    expect(complete[0]).toBe('/api/project-files/uploads/up_1/complete/?project_id=p1');
  });

  it('stops before sending when the file is too large', async () => {
    apiFetch.mockResolvedValueOnce(
      respond(413, { error: 'Files can be at most 100 MB.', code: 'too_large' })
    );

    const error = await uploadProjectFile(file).catch(e => e);

    expect(error.code).toBe('too_large');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('file import jobs', () => {
  it('inspects a file and polls the job', async () => {
    const tables = [{ name: 'sales_q3', columns: [], rows: [], row_count: 0 }];
    apiFetch
      .mockResolvedValueOnce(respond(202, { job_id: 'j1', status: 'queued' }))
      .mockResolvedValueOnce(
        respond(200, { job_id: 'j1', status: 'completed', result: { file: fileVersion, tables } })
      );

    const result = await inspectProjectFile({
      path: 'files/sales_q3.csv',
      versionId: 'fv_1',
      projectId: 'p1',
    });

    expect(result).toMatchObject({ ok: true, result: { tables } });
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      action: 'inspect',
      path: 'files/sales_q3.csv',
      version_id: 'fv_1',
      options: {},
    });
    expect(apiFetch.mock.calls[1][0]).toBe('/api/project-file-imports/j1/?project_id=p1');
  });

  it('imports a file as a named source', async () => {
    apiFetch
      .mockResolvedValueOnce(respond(202, { job_id: 'j2', status: 'queued' }))
      .mockResolvedValueOnce(
        respond(200, {
          job_id: 'j2',
          status: 'completed',
          result: { file: fileVersion, source: { name: 'sales_q3' }, tables: [] },
        })
      );

    const result = await importProjectFile({
      path: 'files/sales_q3.csv',
      sourceName: 'sales_q3',
      options: { header: true },
    });

    expect(result.result.source.name).toBe('sales_q3');
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      action: 'import',
      path: 'files/sales_q3.csv',
      source_name: 'sales_q3',
      options: { header: true },
    });
  });

  it('reports a failed import as an outcome, not an exception', async () => {
    apiFetch
      .mockResolvedValueOnce(respond(202, { job_id: 'j3', status: 'queued' }))
      .mockResolvedValueOnce(
        respond(200, { job_id: 'j3', status: 'failed', error: 'Row 4 has 3 columns, expected 2.' })
      );

    const result = await importProjectFile({ path: 'files/bad.csv', sourceName: 'bad' });

    expect(result).toMatchObject({ ok: false, error: 'Row 4 has 3 columns, expected 2.' });
  });
});
