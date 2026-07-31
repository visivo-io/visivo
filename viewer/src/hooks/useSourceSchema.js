import { useState, useEffect, useCallback } from 'react';
import useStore from '../stores/store';
import {
  fetchSourceSchema,
  tablesFromEnvelope,
  columnsFromEnvelope,
} from '../api/sourceSchemaJobs';

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
  // Subscribed at render rather than read via getState() inside an async
  // callback: that samples the id at request time, not render time.
  const projectId = useStore(s => s.project?.id);

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
      // One request for the whole envelope, then slice locally. This used to
      // fetch the table list and then every table's columns in a SEQUENTIAL
      // loop — a source with 40 tables was 41 serialized round trips before
      // autocomplete worked at all. Every column was fetched either way, so
      // there was nothing to be gained by asking for them separately.
      const envelope = await fetchSourceSchema(sourceName, runId, projectId);
      const fetchedTables = tablesFromEnvelope(envelope);
      setTables(fetchedTables);

      const columnsMap = {};
      for (const table of fetchedTables) {
        columnsMap[table.name] = columnsFromEnvelope(envelope, table.name);
      }
      setTableColumns(columnsMap);
    } catch (err) {
      setError(err.message);
      setTables([]);
      setTableColumns({});
    } finally {
      setIsLoading(false);
    }
  }, [sourceName, runId, projectId]);

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
