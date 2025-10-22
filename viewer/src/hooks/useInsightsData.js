import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchInsights } from '../api/insights';
import { loadInsightParquetFiles, runDuckDBQuery, prepPostQuery } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';

/**
 * Process a single insight: load files, execute query, store results
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {Object} insight - Insight object from API
 * @param {Object} inputs - Current input values
 * @returns {Promise<Object>} Processed insight data
 */
const processInsight = async (db, insight, inputs) => {
  try {
    const { id, name, files, query, props_mapping } = insight;
    const insightName = id || name;

    console.debug(`Processing insight '${insightName}'`);

    // Step 1: Load parquet files (with caching)
    const { loaded, failed } = await loadInsightParquetFiles(db, files);

    if (failed.length > 0) {
      console.error(`Failed to load ${failed.length} files for insight '${insightName}':`, failed);
      // Continue anyway - partial data might be better than none
    }

    console.debug(`Loaded ${loaded.length} parquet files for insight '${insightName}'`);

    // Step 2: Prepare post_query with input substitution
    const preparedQuery = prepPostQuery({ query }, inputs);

    console.debug(`Executing query for insight '${insightName}':`, preparedQuery);

    // Step 3: Execute query in DuckDB
    const result = await runDuckDBQuery(db, preparedQuery, 3, 1000);

    // Step 4: Process results
    const processedRows = result.toArray().map(row => {
      const rowData = row.toJSON();
      return Object.fromEntries(
        Object.entries(rowData).map(([key, value]) => [
          key,
          typeof value === 'bigint' ? value.toString() : value,
        ])
      );
    });

    console.debug(`Query returned ${processedRows.length} rows for insight '${insightName}'`);

    // Step 5: Return structured data
    return {
      [insightName]: {
        id: insightName,
        name: insightName,
        data: processedRows,
        files,
        query,
        props_mapping,
        loaded: loaded.length,
        failed: failed.length,
        error: null,
      },
    };
  } catch (error) {
    const insightName = insight.id || insight.name;
    console.error(`Failed to process insight '${insightName}':`, error);

    return {
      [insightName]: {
        id: insightName,
        name: insightName,
        data: [],
        files: insight.files || [],
        query: insight.query || null,
        props_mapping: insight.props_mapping || {},
        loaded: 0,
        failed: insight.files?.length || 0,
        error: error.message || String(error),
      },
    };
  }
};

/**
 * Hook for loading and managing insights data
 *
 * Orchestrates the complete insight loading pipeline:
 * 1. Fetch insight metadata from API
 * 2. Load required parquet files into DuckDB as tables (using name_hash as table name)
 * 3. Execute post_query with input substitution (query already references table names)
 * 4. Store results in Zustand store
 *
 * @param {string} projectId - Project ID
 * @param {string[]} insightNames - Array of insight names to load
 * @returns {Object} Insights data and loading state
 */
export const useInsightsData = (projectId, insightNames) => {
  const db = useDuckDB();
  const setInsights = useStore(state => state.setInsights);
  const storeInsightData = useStore(state => state.insights);
  const inputs = useStore(state => state.inputs) || {};

  // Stable sorted array to prevent unnecessary re-fetches
  const stableInsightNames = useMemo(() => {
    if (!insightNames?.length) return [];
    return [...new Set(insightNames)].sort(); // Dedupe and sort
  }, [insightNames]);

  // Check if we already have complete data for all requested insights
  const hasCompleteData = useMemo(() => {
    if (!stableInsightNames.length) return true;
    if (!storeInsightData) return false;

    return stableInsightNames.every(
      name => storeInsightData[name]?.data && storeInsightData[name]?.data.length >= 0
    );
  }, [storeInsightData, stableInsightNames]);

  // Main query function
  const queryFn = useCallback(async () => {
    if (!db) {
      console.warn('DuckDB not initialized');
      return {};
    }

    if (!stableInsightNames.length) {
      console.debug('No insights to fetch');
      return {};
    }

    console.debug(`Fetching ${stableInsightNames.length} insights:`, stableInsightNames);

    // Step 1: Fetch insight metadata from API
    const insights = await fetchInsights(projectId, stableInsightNames);

    if (!insights?.length) {
      console.warn('No insights returned from API');
      return {};
    }

    console.debug(`Fetched ${insights.length} insights from API`);

    // Step 2: Process each insight in parallel
    const results = await Promise.allSettled(
      insights.map(insight => processInsight(db, insight, inputs))
    );

    // Step 3: Merge results
    const mergedData = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        Object.assign(mergedData, result.value);
      } else {
        const insightName = stableInsightNames[index];
        console.error(`Failed to process insight '${insightName}':`, result.reason);
        // Add error state for this insight
        mergedData[insightName] = {
          id: insightName,
          name: insightName,
          data: [],
          error: result.reason.message || String(result.reason),
        };
      }
    });

    console.debug(`Successfully processed ${Object.keys(mergedData).length} insights`);

    return mergedData;
  }, [db, projectId, stableInsightNames, inputs]);

  // React Query for data fetching
  const { data, isLoading, error } = useQuery({
    queryKey: ['insights', projectId, stableInsightNames, !!db],
    queryFn,
    enabled: !!projectId && stableInsightNames.length > 0 && !!db && !hasCompleteData,
    staleTime: Infinity,
    gcTime: Infinity, // formerly cacheTime
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  // Update store when data arrives
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      console.debug('Updating store with insights data:', Object.keys(data));
      setInsights(data);
    }
  }, [data, setInsights]);

  return {
    insightsData: storeInsightData || {},
    isLoading: hasCompleteData ? false : isLoading,
    hasAllData: hasCompleteData || (data && Object.keys(data).length > 0),
    error,
  };
};
