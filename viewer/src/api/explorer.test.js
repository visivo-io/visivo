import {
  fetchExplorer,
  fetchSourceMetadata,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
  testSourceConnection,
  fetchColumns,
} from './explorer';

// Mock fetch globally
global.fetch = jest.fn();

// Mock console.error to avoid noise in tests
global.console.error = jest.fn();

describe('explorer API functions', () => {
  beforeEach(() => {
    fetch.mockClear();
    console.error.mockClear();
  });

  describe('fetchExplorer', () => {
    it('should fetch explorer data successfully', async () => {
      const mockData = { models: [], traces: [] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchExplorer();

      expect(fetch).toHaveBeenCalledWith('/api/explorer/');
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should return null and log error on failure', async () => {
      fetch.mockResolvedValueOnce({
        status: 404,
      });

      const result = await fetchExplorer();

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Failed to fetch explorer data');
    });
  });

  describe('fetchSourceMetadata', () => {
    it('should fetch source metadata successfully', async () => {
      const mockData = { sources: [{ name: 'test_source' }] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchSourceMetadata();

      expect(fetch).toHaveBeenCalledWith('/api/project/sources_metadata');
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should return null and log error on failure', async () => {
      fetch.mockResolvedValueOnce({
        status: 500,
      });

      const result = await fetchSourceMetadata();

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Failed to fetch source metadata');
    });
  });

  describe('fetchDatabases', () => {
    it('should fetch databases for a source successfully', async () => {
      const sourceName = 'test_source';
      const mockData = { databases: ['db1', 'db2'] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchDatabases(sourceName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle special characters in source name', async () => {
      const sourceName = 'source with spaces/special@chars';
      const mockData = { databases: ['db1'] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchDatabases(sourceName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/source%20with%20spaces%2Fspecial%40chars/databases`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      fetch.mockResolvedValueOnce({
        status: 404,
      });

      const result = await fetchDatabases(sourceName);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        `Failed to fetch databases for source: ${sourceName}`
      );
    });
  });

  describe('fetchSchemas', () => {
    it('should fetch schemas successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const mockData = { schemas: ['public', 'private'] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchSchemas(sourceName, databaseName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/schemas`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle special characters in names', async () => {
      const sourceName = 'source@123';
      const databaseName = 'db with spaces';
      const mockData = { schemas: [] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchSchemas(sourceName, databaseName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/source%40123/databases/db%20with%20spaces/schemas`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      fetch.mockResolvedValueOnce({
        status: 503,
      });

      const result = await fetchSchemas(sourceName, databaseName);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        `Failed to fetch schemas for ${sourceName}.${databaseName}`
      );
    });
  });

  describe('fetchTables', () => {
    it('should fetch tables with schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const schemaName = 'public';
      const mockData = { tables: ['users', 'orders'] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchTables(sourceName, databaseName, schemaName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/schemas/${encodeURIComponent(schemaName)}/tables`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should fetch tables without schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const mockData = { tables: ['table1', 'table2'] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchTables(sourceName, databaseName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/tables`
      );
      expect(result).toEqual(mockData);
    });

    it('should fetch tables with null schema', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const schemaName = null;
      const mockData = { tables: ['table1'] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchTables(sourceName, databaseName, schemaName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/tables`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const schemaName = 'public';
      fetch.mockResolvedValueOnce({
        status: 403,
      });

      const result = await fetchTables(sourceName, databaseName, schemaName);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        `Failed to fetch tables for ${sourceName}.${databaseName}.${schemaName}`
      );
    });
  });

  describe('testSourceConnection', () => {
    it('should test source connection successfully', async () => {
      const sourceName = 'test_source';
      const mockData = { status: 'connected' };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await testSourceConnection(sourceName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/test-connection`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle special characters in source name', async () => {
      const sourceName = 'source/with/slashes';
      const mockData = { status: 'connected' };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await testSourceConnection(sourceName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/source%2Fwith%2Fslashes/test-connection`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      fetch.mockResolvedValueOnce({
        status: 500,
      });

      const result = await testSourceConnection(sourceName);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        `Failed to test connection for source: ${sourceName}`
      );
    });
  });

  describe('fetchColumns', () => {
    it('should fetch columns with schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const tableName = 'users';
      const schemaName = 'public';
      const mockData = { columns: [{ name: 'id', type: 'INTEGER' }] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName, schemaName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(
          tableName
        )}/columns`
      );
      expect(result).toEqual(mockData);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should fetch columns without schema successfully', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const tableName = 'products';
      const mockData = { columns: [{ name: 'name', type: 'VARCHAR' }] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(
          databaseName
        )}/tables/${encodeURIComponent(tableName)}/columns`
      );
      expect(result).toEqual(mockData);
    });

    it('should handle special characters in all parameters', async () => {
      const sourceName = 'source@123';
      const databaseName = 'db with spaces';
      const tableName = 'table/special';
      const schemaName = 'schema.name';
      const mockData = { columns: [] };
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName, schemaName);

      expect(fetch).toHaveBeenCalledWith(
        `/api/project/sources/source%40123/databases/db%20with%20spaces/schemas/schema.name/tables/table%2Fspecial/columns`
      );
      expect(result).toEqual(mockData);
    });

    it('should return null and log error on failure', async () => {
      const sourceName = 'test_source';
      const databaseName = 'test_db';
      const tableName = 'users';
      const schemaName = 'public';
      fetch.mockResolvedValueOnce({
        status: 404,
      });

      const result = await fetchColumns(sourceName, databaseName, tableName, schemaName);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        `Failed to fetch columns for ${sourceName}.${databaseName}.${schemaName}.${tableName}`
      );
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      let result;
      try {
        result = await fetchExplorer();
      } catch (e) {
        result = null;
      }

      expect(result).toBeNull();
    });

    it('should throw fetch exceptions', async () => {
      const networkError = new Error('Connection refused');
      fetch.mockRejectedValue(networkError);

      // Test each function throws the error
      await expect(fetchExplorer()).rejects.toThrow('Connection refused');
      await expect(fetchSourceMetadata()).rejects.toThrow('Connection refused');
      await expect(fetchDatabases('test')).rejects.toThrow('Connection refused');
      await expect(fetchSchemas('test', 'db')).rejects.toThrow('Connection refused');
      await expect(fetchTables('test', 'db')).rejects.toThrow('Connection refused');
      await expect(testSourceConnection('test')).rejects.toThrow('Connection refused');
      await expect(fetchColumns('test', 'db', 'table')).rejects.toThrow('Connection refused');
    });
  });
});
