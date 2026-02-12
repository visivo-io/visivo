import { useState, useEffect, useCallback } from 'react';
import { fetchSourceTables, fetchTableColumns } from '../api/sourceSchemaJobs';

/**
 * Hook for fetching and managing source schema data for SQL autocomplete.
 *
 * Provides table and column information that can be used for Monaco editor
 * autocomplete suggestions.
 *
 * @param {string} sourceName - Name of the source to fetch schema for
 * @param {Object} options - Optional configuration
 * @param {string} options.runId - Optional run_id to fetch from specific version
 * @returns {Object} Schema state and controls
 */
export const useSourceSchema = (sourceName, options = {}) => {
  const { runId = null } = options;

  const [tables, setTables] = useState([]);
  const [tableColumns, setTableColumns] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSchema = useCallback(async () => {
    if (!sourceName) {
      setTables([]);
      setTableColumns({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchedTables = await fetchSourceTables(sourceName, { runId });
      setTables(fetchedTables || []);

      const columnsMap = {};
      for (const table of fetchedTables || []) {
        const tableName = table.table_name || table.name;
        if (tableName) {
          try {
            const columns = await fetchTableColumns(sourceName, tableName, { runId });
            columnsMap[tableName] = columns || [];
          } catch {
            columnsMap[tableName] = [];
          }
        }
      }
      setTableColumns(columnsMap);
    } catch (err) {
      setError(err.message);
      setTables([]);
      setTableColumns({});
    } finally {
      setIsLoading(false);
    }
  }, [sourceName, runId]);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  return {
    tables,
    tableColumns,
    isLoading,
    error,
    refresh: fetchSchema,
  };
};

export default useSourceSchema;
