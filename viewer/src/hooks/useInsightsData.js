import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsightJobs } from '../contexts/QueryContext';
import { loadInsightParquetFiles, runDuckDBQuery, prepPostQuery } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { DEFAULT_RUN_ID } from '../constants';

/**
 * Extract input names from a string containing ${inputName.accessor} patterns
 * @param {string} text - Text with ${...} placeholders
 * @returns {Set<string>} - Set of unique input names found
 */
const extractInputNamesFromString = text => {
  if (!text) return new Set();
  const regex = /\$\{(\w+)\.\w+\}/g;
  const matches = text.matchAll(regex);
  const inputNames = new Set();
  for (const match of matches) {
    inputNames.add(match[1]);
  }
  return inputNames;
};

/**
 * Extract input names from a nested object structure (like static_props)
 * @param {*} obj - Object/array/string to scan
 * @returns {Set<string>} - Set of unique input names found
 */
const extractInputNamesFromObject = obj => {
  const inputNames = new Set();

  const scan = value => {
    if (typeof value === 'string') {
      for (const name of extractInputNamesFromString(value)) {
        inputNames.add(name);
      }
    } else if (Array.isArray(value)) {
      value.forEach(item => scan(item));
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(val => scan(val));
    }
  };

  scan(obj);
  return inputNames;
};

/**
 * Extract input names referenced in a query string and/or static_props
 * Looks for ${inputName.accessor} patterns (template literal syntax)
 * @param {string} query - SQL query with ${...} placeholders
 * @param {Object} staticProps - Static props object that may contain input refs
 * @param {string[]} knownInputNames - Optional list of known input names to match against
 * @returns {string[]} - Array of unique input names found
 */
const extractInputDependencies = (query, staticProps = null, knownInputNames = null) => {
  // If knownInputNames provided, use the old matching logic
  if (knownInputNames?.length) {
    const dependencies = [];
    const textToSearch = (query || '') + JSON.stringify(staticProps || {});
    for (const inputName of knownInputNames) {
      // Check if ${inputName} appears (as prefix of ${inputName.accessor})
      if (textToSearch.includes(`\${${inputName}`)) {
        dependencies.push(inputName);
      }
    }
    return dependencies;
  }

  // Otherwise, extract input names directly using regex
  const inputNames = new Set();

  // Extract from query
  for (const name of extractInputNamesFromString(query)) {
    inputNames.add(name);
  }

  // Extract from static_props
  for (const name of extractInputNamesFromObject(staticProps)) {
    inputNames.add(name);
  }

  return [...inputNames];
};

/**
 * Process a single insight: load files, execute query, store results
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {Object} insight - Insight object from API
 * @param {Object} inputs - Current input values
 * @returns {Promise<Object>} Processed insight data
 */
const processInsight = async (db, insight, inputs, { forceReload = false } = {}) => {
  try {
    const { name, files, query, props_mapping, split_key, type, static_props } = insight;
    const insightName = name;

    // Check for required inputs BEFORE loading parquet files
    // Extract input names from the query and static_props (e.g., ${sort_direction.value} -> sort_direction)
    const requiredInputs = extractInputDependencies(query, static_props);

    // Check if all required inputs are present
    const missingInputs = requiredInputs.filter(inputName => !inputs[inputName]);

    if (missingInputs.length > 0) {
      // Return metadata without data - will be re-processed when inputs are ready
      return {
        [insightName]: {
          name: insightName,
          data: null, // null indicates waiting for inputs (vs [] which is empty result)
          files,
          query,
          props_mapping,
          static_props,
          split_key,
          type,
          loaded: 0,
          failed: 0,
          error: null,
          pendingInputs: missingInputs, // Track which inputs we're waiting for
          inputDependencies: requiredInputs, // Pre-computed input dependencies for selective subscriptions
        },
      };
    }

    const { loaded, failed } = await loadInsightParquetFiles(db, files, forceReload);

    const preparedQuery = prepPostQuery({ query }, inputs);

    const result = await runDuckDBQuery(db, preparedQuery, 3, 1000);

    const processedRows = result.toArray().map(row => {
      const rowData = row.toJSON();
      return Object.fromEntries(
        Object.entries(rowData).map(([key, value]) => [
          key,
          typeof value === 'bigint' ? value.toString() : value,
        ])
      );
    });

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
        pendingInputs: null, // Clear pending state
        inputDependencies: requiredInputs, // Pre-computed input dependencies for selective subscriptions
      },
    };
  } catch (error) {
    const insightName = insight.name;
    // Extract input dependencies even in error case for Chart.jsx selective subscriptions
    const errorInputDependencies = extractInputDependencies(insight.query, insight.static_props);

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
        pendingInputs: null,
        inputDependencies: errorInputDependencies,
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
 * @param {string} runId - Run ID to load data from (default: "main")
 * @param {Object} options - Optional configuration
 * @param {string} options.storeKeyPrefix - Prefix for Zustand store keys (e.g., '__preview__')
 * @param {*} options.cacheKey - Extra key for React Query cache busting (e.g., runInstanceId)
 * @returns {Object} Insights data and loading state
 */
export const useInsightsData = (
  projectId,
  insightNames,
  runId = DEFAULT_RUN_ID,
  { storeKeyPrefix = '', cacheKey = null } = {}
) => {
  const db = useDuckDB();
  const fetchInsights = useFetchInsightJobs();
  const setInsightJobs = useStore(state => state.setInsightJobs);
  const storeInsightData = useStore(state => state.insightJobs);
  const getInputs = useStore(state => state.inputJobs);

  // Stable sorted array to prevent unnecessary re-fetches
  const stableInsightNames = useMemo(() => {
    if (!insightNames?.length) return [];
    return [...new Set(insightNames)].sort(); // Dedupe and sort
  }, [insightNames]);

  // Check if we have query metadata for all requested insights
  // This is used to determine if we can compute input dependencies
  // Use storeKeyPrefix to look up the correct keys (e.g., '__preview__' prefix in preview mode)
  const hasQueryMetadata = useMemo(() => {
    if (!stableInsightNames.length) return false;
    if (!storeInsightData) return false;

    return stableInsightNames.every(
      name => storeInsightData[storeKeyPrefix + name]?.query !== undefined
    );
  }, [storeInsightData, stableInsightNames, storeKeyPrefix]);

  // Check if we have complete data for all requested insights
  // This is used to determine the hasAllInsightData return value
  // data: null means waiting for inputs, data: [] means empty result (which is complete)
  const hasCompleteData = useMemo(() => {
    if (!stableInsightNames.length) return true; // No insights = complete
    if (!storeInsightData) return false;

    return stableInsightNames.every(name => {
      const entry = storeInsightData[storeKeyPrefix + name];
      return entry?.data !== null && entry?.data !== undefined && !entry?.pendingInputs?.length;
    });
  }, [storeInsightData, stableInsightNames, storeKeyPrefix]);

  // Check if any insights are waiting for inputs that are now available
  // This triggers a refetch when inputs become ready
  const pendingInsightInputsReady = useMemo(() => {
    if (!storeInsightData || !getInputs) return false;

    for (const insightName of stableInsightNames) {
      const insight = storeInsightData[storeKeyPrefix + insightName];
      if (insight?.pendingInputs?.length) {
        // Check if all pending inputs are now available
        const allReady = insight.pendingInputs.every(inputName => getInputs[inputName]);
        if (allReady) {
          return true; // At least one insight is now ready to process
        }
      }
    }
    return false;
  }, [storeInsightData, getInputs, stableInsightNames, storeKeyPrefix]);

  // Compute relevant input values based on which inputs each insight actually uses
  // This enables selective refetch - only refetch when inputs that matter change
  const relevantInputValues = useMemo(() => {
    if (!getInputs) return {};
    if (!hasQueryMetadata || !storeInsightData) return {};

    const knownInputNames = Object.keys(getInputs);
    const relevantInputs = {};

    // Check each insight's query and static_props for input dependencies
    for (const insightName of stableInsightNames) {
      const insight = storeInsightData[storeKeyPrefix + insightName];
      if (insight?.query || insight?.static_props) {
        const deps = extractInputDependencies(insight.query, insight.static_props, knownInputNames);
        deps.forEach(inputName => {
          relevantInputs[inputName] = getInputs[inputName];
        });
      }
    }

    return relevantInputs;
  }, [getInputs, storeInsightData, stableInsightNames, hasQueryMetadata, storeKeyPrefix]);

  // Create a stable string representation of relevant inputs for the queryKey
  // On initial load (no query metadata yet), use 'initial' to force first fetch
  const stableRelevantInputs = useMemo(() => {
    if (!hasQueryMetadata) return 'initial';
    return JSON.stringify(relevantInputValues);
  }, [hasQueryMetadata, relevantInputValues]);

  const isPreviewMode = storeKeyPrefix !== '';

  // Main query function
  const queryFn = useCallback(async () => {
    if (!db) return {};
    if (!stableInsightNames.length) return {};
    if (!fetchInsights) return {};

    const insights = await fetchInsights(projectId, stableInsightNames, runId);
    if (!insights?.length) return {};

    // Get FRESH inputs from store (not closure value) to avoid race condition
    const freshInputs = useStore.getState().inputJobs || {};

    const results = await Promise.allSettled(
      insights.map(insight =>
        processInsight(db, insight, freshInputs, { forceReload: isPreviewMode })
      )
    );

    const mergedData = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        Object.assign(mergedData, result.value);
      } else {
        const insightName = stableInsightNames[index];
        mergedData[insightName] = {
          name: insightName,
          data: [],
          error: result.reason.message || String(result.reason),
        };
      }
    });

    return mergedData;
  }, [db, projectId, stableInsightNames, fetchInsights, runId, isPreviewMode]);

  // React Query for data fetching
  // The queryKey includes stableRelevantInputs to trigger refetch when relevant inputs change
  // Also includes pendingInsightInputsReady to trigger refetch when pending inputs become available
  // Also includes runId to separate cache for different runs
  // Also includes cacheKey for preview cache busting (runInstanceId changes each preview run)
  const queryEnabled = !!projectId && stableInsightNames.length > 0 && !!db && !!runId;

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'insights',
      projectId,
      runId,
      stableInsightNames,
      !!db,
      stableRelevantInputs,
      pendingInsightInputsReady,
      cacheKey,
    ],
    queryFn,
    enabled: queryEnabled,
    staleTime: Infinity,
    gcTime: Infinity, // formerly cacheTime
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  // Update store when data arrives
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      if (storeKeyPrefix) {
        const prefixed = {};
        for (const [key, value] of Object.entries(data)) {
          prefixed[storeKeyPrefix + key] = value;
        }
        setInsightJobs(prefixed);
      } else {
        setInsightJobs(data);
      }
    }
  }, [data, setInsightJobs, storeKeyPrefix]);

  const returnValue = {
    insights: storeInsightData || {},
    insightsData: storeInsightData || {},
    isInsightsLoading: isLoading,
    // Only report hasAllInsightData=true when we have complete data without pending inputs
    // Don't use `data` fallback as it may contain insights with pendingInputs
    hasAllInsightData: hasCompleteData,
    error,
  };

  return returnValue;
};
