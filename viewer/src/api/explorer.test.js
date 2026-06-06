import {
  fetchSourceMetadata,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
  testSourceConnection,
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
