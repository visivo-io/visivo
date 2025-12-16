import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import { loadInsightParquetFiles, runDuckDBQuery, prepPostQuery } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';

/**
 * Extract input names referenced in a query string
 * Looks for ${inputName} patterns (template literal syntax)
 * @param {string} query - SQL query with ${...} placeholders
 * @param {string[]} knownInputNames - List of known input names to match against
 * @returns {string[]} - Array of input names found in the query
 */
const extractInputDependencies = (query, knownInputNames) => {
  if (!query || !knownInputNames?.length) return [];

  const dependencies = [];
  for (const inputName of knownInputNames) {
    // Check if ${inputName} appears in the query
    if (query.includes(`\${${inputName}}`)) {
      dependencies.push(inputName);
    }
  }
  return dependencies;
};

/**
 * Process a single insight: load files, execute query, store results
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {Object} insight - Insight object from API
 * @param {Object} inputs - Current input values
 * @returns {Promise<Object>} Processed insight data
 */
const processInsight = async (db, insight, inputs) => {
  try {
    const { name, files, query, props_mapping, split_key, type, static_props } = insight;
    const insightName = name;

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
        name: insightName,
        data: processedRows,
        files,
        query,
        props_mapping,
        static_props, // Non-query props (e.g., marker.color: ["red", "green"])
        split_key,
        type, // Trace type (bar, scatter, etc.)
        loaded: loaded.length,
        failed: failed.length,
        error: null,
      },
    };
  } catch (error) {
    const insightName = insight.name;
    console.error(`Failed to process insight '${insightName}':`, error);

    return {
      [insightName]: {
        name: insightName,
        data: [],
        files: insight.files || [],
        query: insight.query || null,
        props_mapping: insight.props_mapping || {},
        static_props: insight.static_props || {},
        split_key: insight.split_key || null,
        type: insight.type || null,
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
  const fetchInsights = useFetchInsights();
  const setInsights = useStore(state => state.setInsights);
  const storeInsightData = useStore(state => state.insights);
  const getInputs = useStore(state => state.inputs);

  // Stable sorted array to prevent unnecessary re-fetches
  const stableInsightNames = useMemo(() => {
    if (!insightNames?.length) return [];
    return [...new Set(insightNames)].sort(); // Dedupe and sort
  }, [insightNames]);

  // Check if we have query metadata for all requested insights
  // This is used to determine if we can compute input dependencies
  const hasQueryMetadata = useMemo(() => {
    if (!stableInsightNames.length) return false;
    if (!storeInsightData) return false;

    return stableInsightNames.every(name => storeInsightData[name]?.query !== undefined);
  }, [storeInsightData, stableInsightNames]);

  // Check if we have complete data for all requested insights
  // This is used to determine the hasAllInsightData return value
  const hasCompleteData = useMemo(() => {
    if (!stableInsightNames.length) return true; // No insights = complete
    if (!storeInsightData) return false;

    return stableInsightNames.every(
      name => storeInsightData[name]?.data && storeInsightData[name]?.data.length >= 0
    );
  }, [storeInsightData, stableInsightNames]);

  // Compute relevant input values based on which inputs each insight actually uses
  // This enables selective refetch - only refetch when inputs that matter change
  const relevantInputValues = useMemo(() => {
    if (!getInputs) return {};
    if (!hasQueryMetadata || !storeInsightData) return {};

    const knownInputNames = Object.keys(getInputs);
    const relevantInputs = {};

    // Check each insight's query for input dependencies
    for (const insightName of stableInsightNames) {
      const insight = storeInsightData[insightName];
      if (insight?.query) {
        const deps = extractInputDependencies(insight.query, knownInputNames);
        deps.forEach(inputName => {
          relevantInputs[inputName] = getInputs[inputName];
        });
      }
    }

    return relevantInputs;
  }, [getInputs, storeInsightData, stableInsightNames, hasQueryMetadata]);

  // Create a stable string representation of relevant inputs for the queryKey
  // On initial load (no query metadata yet), use 'initial' to force first fetch
  const stableRelevantInputs = useMemo(() => {
    if (!hasQueryMetadata) return 'initial';
    return JSON.stringify(relevantInputValues);
  }, [hasQueryMetadata, relevantInputValues]);

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

    // Get current inputs from store
    const inputs = getInputs || {};

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
          name: insightName,
          data: [],
          error: result.reason.message || String(result.reason),
        };
      }
    });

    console.debug(`Successfully processed ${Object.keys(mergedData).length} insights`);

    return mergedData;
  }, [db, projectId, stableInsightNames, getInputs, fetchInsights]);

  // React Query for data fetching
  // The queryKey includes stableRelevantInputs to trigger refetch when relevant inputs change
  // This enables selective refetch - only insights using the changed input will refetch
  const { data, isLoading, error } = useQuery({
    queryKey: ['insights', projectId, stableInsightNames, !!db, stableRelevantInputs],
    queryFn,
    enabled: !!projectId && stableInsightNames.length > 0 && !!db,
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
    isInsightsLoading: isLoading,
    hasAllInsightData: hasCompleteData || (data && Object.keys(data).length > 0),
    error,
  };
};
