import {
  fetchSourceMetadata,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
  testSourceConnection,
  testSourceConnectionFromConfig,
  fetchColumns,
} from './explorer';
import { apiFetch } from './utils';

// Mock apiFetch globally
jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

// Mock console.error to avoid noise in tests
global.console.error = jest.fn();

describe('explorer API functions', () => {
  beforeEach(() => {
    apiFetch.mockClear();
    console.error.mockClear();
  });

  describe('fetchSourceMetadata', () => {
    it('should apiFetch source metadata successfully', async () => {
      const mockData = { sources: [{ name: 'test_source' }] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchSourceMetadata();

      expect(apiFetch).toHaveBeenCalledWith('/api/project/sources_metadata/');
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should return null and log error on failure', async () => {
      apiFetch.mockResolvedValueOnce({
        status: 500,
      });

      const result = await fetchSourceMetadata();

      expect(result).toBeNull();
    });
  });

  describe('fetchDatabases', () => {
    it('should apiFetch databases for a source successfully', async () => {
      const sourceName = 'test_source';
      const mockData = { databases: ['db1', 'db2'] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchDatabases(sourceName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle special characters in source name', async () => {
      const sourceName = 'source with spaces/special@chars';
      const mockData = { databases: ['db1'] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchDatabases(sourceName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/source%20with%20spaces%2Fspecial%40chars/databases/`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      apiFetch.mockResolvedValueOnce({
        status: 404,
      });

      const result = await fetchDatabases(sourceName);

      expect(result).toBeNull();
    });
  });

  describe('fetchSchemas', () => {
    it('should apiFetch schemas successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const mockData = { schemas: ['public', 'private'] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchSchemas(sourceName, databaseName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/schemas/`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle special characters in names', async () => {
      const sourceName = 'source@123';
      const databaseName = 'db with spaces';
      const mockData = { schemas: [] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchSchemas(sourceName, databaseName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/source%40123/databases/db%20with%20spaces/schemas/`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      apiFetch.mockResolvedValueOnce({
        status: 503,
      });

      const result = await fetchSchemas(sourceName, databaseName);

      expect(result).toBeNull();
    });
  });

  describe('fetchTables', () => {
    it('should apiFetch tables with schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const schemaName = 'public';
      const mockData = { tables: ['users', 'orders'] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchTables(sourceName, databaseName, schemaName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/schemas/${encodeURIComponent(schemaName)}/tables/`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should apiFetch tables without schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const mockData = { tables: ['table1', 'table2'] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchTables(sourceName, databaseName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/tables/`
      );
      expect(result).toEqual(mockData);
    });

    it('should apiFetch tables with null schema', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const schemaName = null;
      const mockData = { tables: ['table1'] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchTables(sourceName, databaseName, schemaName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/tables/`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const schemaName = 'public';
      apiFetch.mockResolvedValueOnce({
        status: 403,
      });

      const result = await fetchTables(sourceName, databaseName, schemaName);

      expect(result).toBeNull();
    });
  });

  describe('testSourceConnection', () => {
    it('should test source connection successfully', async () => {
      const sourceName = 'test_source';
      const mockData = { status: 'connected' };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await testSourceConnection(sourceName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/test-connection/`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle special characters in source name', async () => {
      const sourceName = 'source/with/slashes';
      const mockData = { status: 'connected' };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await testSourceConnection(sourceName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/source%2Fwith%2Fslashes/test-connection/`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      apiFetch.mockResolvedValueOnce({
        status: 500,
      });

      const result = await testSourceConnection(sourceName);

      expect(result).toBeNull();
    });
  });

  describe('fetchColumns', () => {
    it('should apiFetch columns with schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const tableName = 'users';
      const schemaName = 'public';
      const mockData = { columns: [{ name: 'id', type: 'INTEGER' }] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName, schemaName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(
          tableName
        )}/columns/`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should apiFetch columns without schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const tableName = 'products';
      const mockData = { columns: [{ name: 'name', type: 'VARCHAR' }] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/tables/${encodeURIComponent(tableName)}/columns/`
      );
      expect(result).toEqual(mockData);
    });

    it('should handle special characters in all parameters', async () => {
      const sourceName = 'source@123';
      const databaseName = 'db with spaces';
      const tableName = 'table/special';
      const schemaName = 'schema.name';
      const mockData = { columns: [] };
      apiFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName, schemaName);

      expect(apiFetch).toHaveBeenCalledWith(
        `/api/project/sources/source%40123/databases/db%20with%20spaces/schemas/schema.name/tables/table%2Fspecial/columns/`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const tableName = 'users';
      const schemaName = 'public';
      apiFetch.mockResolvedValueOnce({
        status: 404,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName, schemaName);

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      apiFetch.mockRejectedValueOnce(new Error('Network error'));

      let result;
      try {
        result = await fetchSourceMetadata();
      } catch (e) {
        result = null;
      }

      expect(result).toBeNull();
    });

    it('should throw apiFetch exceptions', async () => {
      const networkError = new Error('Connection refused');
      apiFetch.mockRejectedValue(networkError);

      // Test each function throws the error
      await expect(fetchSourceMetadata()).rejects.toThrow('Connection refused');
      await expect(fetchDatabases('test')).rejects.toThrow('Connection refused');
      await expect(fetchSchemas('test', 'db')).rejects.toThrow('Connection refused');
      await expect(fetchTables('test', 'db')).rejects.toThrow('Connection refused');
      await expect(testSourceConnection('test')).rejects.toThrow('Connection refused');
      await expect(fetchColumns('test', 'db', 'table')).rejects.toThrow('Connection refused');
    });
  });
});

// --- asynchronous (cloud) source ops --------------------------------------
//
// The local server does the work in-request and answers 200. Cloud runs it in a
// warm runner pool — nothing can dial into one of those pods, so the work is
// pulled and there is no request to hold open — and answers 202 {job_id} for
// the client to poll. Both call sites must resolve to the same value, so the
// components above them stay unaware of which server they're talking to.

describe('async source ops (202 + poll)', () => {
  const accepted = jobId => ({ status: 202, json: async () => ({ job_id: jobId }) });
  const polled = body => ({ status: 200, json: async () => body });

  beforeEach(() => {
    apiFetch.mockClear();
    jest.useFakeTimers({ advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  it('polls a 202 through to the completed result', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-1'))
      .mockResolvedValueOnce(polled({ status: 'queued' }))
      .mockResolvedValueOnce(polled({ status: 'running' }))
      .mockResolvedValueOnce(polled({ status: 'completed', result: { sources: [] } }));

    await expect(fetchSourceMetadata()).resolves.toEqual({ sources: [] });
    expect(apiFetch).toHaveBeenLastCalledWith('/api/runner-jobs/job-1/');
  });

  it('leaves the synchronous path untouched', async () => {
    // The local server never returns 202, so it must never poll.
    apiFetch.mockResolvedValueOnce(polled({ sources: [{ name: 'db' }] }));
    await expect(fetchSourceMetadata()).resolves.toEqual({ sources: [{ name: 'db' }] });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when an async metadata job fails', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-1'))
      .mockResolvedValueOnce(polled({ status: 'failed', error: 'no driver' }));
    await expect(fetchSourceMetadata()).resolves.toBeNull();
  });

  it('surfaces a failed connection test in the shape the form renders', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-2'))
      .mockResolvedValueOnce(polled({ status: 'failed', error: 'auth failed' }));

    await expect(testSourceConnectionFromConfig({ name: 'db' })).resolves.toEqual({
      status: 'connection_failed',
      error: 'auth failed',
    });
  });

  it('resolves a successful connection test to the runner result', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-2'))
      .mockResolvedValueOnce(
        polled({ status: 'completed', result: { source: 'db', status: 'connected' } })
      );

    await expect(testSourceConnectionFromConfig({ name: 'db' })).resolves.toEqual({
      source: 'db',
      status: 'connected',
    });
  });

  it('a cancelled job is reported, not left hanging', async () => {
    // The reaper cancels a job no worker ever claimed; the UI must resolve.
    apiFetch
      .mockResolvedValueOnce(accepted('job-3'))
      .mockResolvedValueOnce(polled({ status: 'cancelled' }));

    await expect(testSourceConnectionFromConfig({ name: 'db' })).resolves.toEqual({
      status: 'connection_failed',
      error: 'Job cancelled',
    });
  });

  it('a poll that stops answering is reported', async () => {
    apiFetch
      .mockResolvedValueOnce(accepted('job-4'))
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) });

    await expect(testSourceConnectionFromConfig({ name: 'db' })).resolves.toEqual({
      status: 'connection_failed',
      error: 'Lost track of the job',
    });
  });
});
