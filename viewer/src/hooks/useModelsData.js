import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadInsightParquetFiles, runDuckDBQuery } from '../duckdb/queries';
import { processArrowResult } from '../duckdb/resultProcessing';
import { useDuckDB } from '../contexts/DuckDBContext';
import { fetchModelJobs } from '../api/modelJobs';
import useStore from '../stores/store';
import { DEFAULT_RUN_ID } from '../constants';

/**
 * Load one model's built parquet into DuckDB from its model-job and return the
 * rows. The job (from ``fetchModelJobs``) carries ``name_hash`` — the DuckDB
 * table identifier — and ``signed_data_file_url``, the same file contract
 * insights use, so this loads through the identical path and works in the cloud
 * (a server-signed URL) as well as locally.
 *
 * Exported so the model-tab prefill can reuse the exact load path.
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {{name: string, name_hash: string, signed_data_file_url: string}} job
 * @returns {Promise<Object>} Processed model data keyed by model name
 */
export const processModel = async (db, job, force = false) => {
  try {
    const files = [{ name_hash: job.name_hash, signed_data_file_url: job.signed_data_file_url }];

    await loadInsightParquetFiles(db, files, force);

    const result = await runDuckDBQuery(db, `SELECT * FROM "${job.name_hash}"`, 3, 1000);

    return {
      [job.name]: {
        name: job.name,
        data: processArrowResult(result),
        files,
        props_mapping: {},
        error: null,
      },
    };
  } catch (error) {
    return {
      [job.name]: {
        name: job.name,
        data: [],
        files: [],
        props_mapping: {},
        error: error.message || String(error),
      },
    };
  }
};

/**
 * Hook for loading model data into DuckDB.
 *
 * Mirrors useInsightsData: it asks the server (via fetchModelJobs → the
 * /api/model-jobs/ endpoint) which of the named models have built data and for
 * their signed_data_file_url, then loads those parquets. A model with no built
 * data is simply absent from the response.
 *
 * @param {string} projectId - Project ID
 * @param {string[]} modelNames - Array of model names to load
 * @param {string} runId - Run ID (default: "main")
 */
export const useModelsData = (
  projectId,
  modelNames,
  runId = DEFAULT_RUN_ID,
  { cacheKey = null } = {}
) => {
  const db = useDuckDB();
  const setModelJobs = useStore(state => state.setModelJobs);

  const stableModelNames = useMemo(() => {
    if (!modelNames?.length) return [];
    return [...new Set(modelNames)].sort();
  }, [modelNames]);

  const queryFn = useCallback(async () => {
    if (!db || !stableModelNames.length) return {};

    // One request for all of them — the endpoint returns a job (with its
    // signed_data_file_url) for each model that has built data. project_id
    // scopes it in the cloud, where many projects share a model name.
    const jobs = await fetchModelJobs(stableModelNames, { runId, projectId });
    const jobByName = new Map(jobs.map(job => [job.name, job]));

    const results = await Promise.allSettled(
      stableModelNames.map(name => {
        const job = jobByName.get(name);
        if (!job || !job.signed_data_file_url) {
          // Not built yet — an empty, non-error entry, as before.
          return Promise.resolve({
            [name]: { name, data: [], files: [], props_mapping: {}, error: null },
          });
        }
        return processModel(db, job, Boolean(cacheKey));
      })
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
  }, [db, stableModelNames, runId, cacheKey, projectId]);

  const queryEnabled = !!projectId && stableModelNames.length > 0 && !!db && !!runId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['models', projectId, runId, stableModelNames, !!db, cacheKey],
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
