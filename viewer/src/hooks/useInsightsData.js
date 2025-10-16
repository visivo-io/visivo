import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import {
  tableDuckDBExists,
  insertDuckDBFile,
  runDuckDBQuery,
  prepPostQuery,
} from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { fetchInsightData } from '../queries/insightsData';

/**
 * Fetch and cache a parquet file in DuckDB
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string} nameHash - Table name to store the data under
 * @param {string} url - URL to fetch the parquet file from
 * @returns {Promise<boolean>} - True if file was cached, false if already exists
 */
const fetchAndCacheParquetFile = async (db, nameHash, url) => {
  if (!db || !nameHash || !url) return false;

  try {
    const exists = await tableDuckDBExists(db, nameHash).catch(() => false);
    if (exists) {
      return false; // Already cached
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch parquet file: ${response.status}`);
    }

    const blob = await response.blob();
    const file = new File([blob], `${nameHash}.parquet`, {
      type: 'application/octet-stream',
    });

    await insertDuckDBFile(db, file, nameHash);
    return true;
  } catch (error) {
    if (!error.message?.includes('already exists')) {
      console.error(`Failed to cache parquet file ${nameHash}:`, error);
    }
    return false;
  }
};

const getInsightData = async (db, insights, inputs) => {
  let new_data = {};
  for (const insight in insights) {
    try {
      let query = prepPostQuery(insight, inputs);
      const result = await runDuckDBQuery(db, query, 10, 1000);

      const processedRows = result.toArray().map(row => {
        const rowData = row.toJSON();
        return Object.fromEntries(
          Object.entries(rowData).map(([key, value]) => [
            key,
            typeof value === 'bigint' ? value.toString() : value,
          ])
        );
      });

      new_data[insight.name] = {
        ...insight,
        data: processedRows || [],
      };
    } catch (error) {
      console.error(`Failed to query ${insight.name} from DuckDB:`, error);
    }
  }
  return new_data;
};

export const useInsightsData = (projectId, insightNames) => {
  const fetchInsights = useFetchInsights();
  const db = useDuckDB();
  const setInsights = useStore(state => state.setInsights);
  const storeInsightData = useStore(state => state.insights);
  const inputs = useStore(state => state.inputs);

  const stableInsightNames = useMemo(() => {
    if (!insightNames?.length) return [];
    return [...insightNames].sort();
  }, [insightNames]);

  const hasCompleteData = useMemo(() => {
    if (!stableInsightNames.length) return true;
    if (!storeInsightData) return false;

    return stableInsightNames.every(
      name =>
        storeInsightData[name]?.insight &&
        storeInsightData[name]?.props
    );
  }, [storeInsightData, stableInsightNames]);

  const queryFn = useCallback(async () => {
    if (!db && !inputs) return {};

    const insights = await fetchInsights(projectId, stableInsightNames);
    if (!insights?.length) return {};

    const results = await Promise.all(
      insights.map(async insight => {
        try {
          const data = await fetchInsightData(insight);

          await Promise.all(
            data.files.map(fileInfo =>
              fetchAndCacheParquetFile(db, fileInfo.name_hash, fileInfo.signed_data_file_url)
            )
          );

          return data;
        } catch (error) {
          return null;
        }
      })
    );

    return await getInsightData(db, results, inputs);
  }, [db, fetchInsights, projectId, stableInsightNames, inputs]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['insights', projectId, stableInsightNames, !!db],
    queryFn,
    enabled: !!projectId && stableInsightNames.length > 0 && !!db && !hasCompleteData,
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  useMemo(() => {
    if (data && !hasCompleteData && Object.keys(data).length > 0) {
      setInsights(data);
    }
  }, [data, hasCompleteData, setInsights]);

  return {
    insightsData: storeInsightData || {},
    isInsightsLoading: hasCompleteData ? false : isLoading,
    hasAllInsightData: hasCompleteData || (data && Object.keys(data).length > 0),
    error,
  };
};
