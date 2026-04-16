import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadInsightParquetFiles, runDuckDBQuery } from '../duckdb/queries';
import { processArrowResult } from '../duckdb/resultProcessing';
import { useDuckDB } from '../contexts/DuckDBContext';
import { alphaHash } from '../utils/alphaHash';
import useStore from '../stores/store';
import { DEFAULT_RUN_ID } from '../constants';

/**
 * Process a single model: load parquet, execute SELECT *, return results.
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string} modelName - Model name
 * @param {string} runId - Run ID for file path
 * @returns {Promise<Object>} Processed model data keyed by model name
 */
const processModel = async (db, modelName, runId) => {
  try {
    const nameHash = alphaHash(modelName);
    const files = [
      {
        name_hash: nameHash,
        signed_data_file_url: `/api/files/${nameHash}/${runId}/`,
      },
    ];

    await loadInsightParquetFiles(db, files);

    const sql = `SELECT * FROM "${nameHash}"`;
    const result = await runDuckDBQuery(db, sql, 3, 1000);
    const processedRows = processArrowResult(result);

    return {
      [modelName]: {
        name: modelName,
        data: processedRows,
        files,
        props_mapping: {},
        error: null,
      },
    };
  } catch (error) {
    return {
      [modelName]: {
        name: modelName,
        data: [],
        files: [],
        props_mapping: {},
        error: error.message || String(error),
      },
    };
  }
};

/**
 * Hook for loading model data directly into DuckDB.
 *
 * Unlike useInsightsData which fetches insight metadata from the server,
 * this hook computes the model hash client-side and loads the parquet directly.
 *
 * @param {string} projectId - Project ID
 * @param {string[]} modelNames - Array of model names to load
 * @param {string} runId - Run ID (default: "main")
 */
export const useModelsData = (projectId, modelNames, runId = DEFAULT_RUN_ID) => {
  const db = useDuckDB();
  const setModelJobs = useStore(state => state.setModelJobs);

  const stableModelNames = useMemo(() => {
    if (!modelNames?.length) return [];
    return [...new Set(modelNames)].sort();
  }, [modelNames]);

  const queryFn = useCallback(async () => {
    if (!db || !stableModelNames.length) return {};

    const results = await Promise.allSettled(
      stableModelNames.map(name => processModel(db, name, runId))
    );

    const mergedData = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        Object.assign(mergedData, result.value);
      } else {
        const modelName = stableModelNames[index];
        mergedData[modelName] = {
          name: modelName,
          data: [],
          error: result.reason?.message || String(result.reason),
        };
      }
    });

    return mergedData;
  }, [db, stableModelNames, runId]);

  const queryEnabled = !!projectId && stableModelNames.length > 0 && !!db && !!runId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['models', projectId, runId, stableModelNames, !!db],
    queryFn,
    enabled: queryEnabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setModelJobs(data);
    }
  }, [data, setModelJobs]);

  return { isModelsLoading: isLoading, error };
};
