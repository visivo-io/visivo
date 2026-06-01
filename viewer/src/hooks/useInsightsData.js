import { useMemo, useCallback, useEffect } from 'react';
import isEqual from 'lodash/isEqual';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsightJobs } from '../contexts/QueryContext';
import { loadInsightParquetFiles, runDuckDBQuery, prepPostQuery } from '../duckdb/queries';
import { processArrowResult } from '../duckdb/resultProcessing';
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
    const {
      name,
      files,
      query,
      props_mapping,
      split_key,
      type,
      static_props,
      props_slices,
    } = insight;
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
          // Per-prop slice expressions surfaced by the server when the
          // user authored a ?{...}[N|a:b] form. Read in
          // chartDataFromInsightData → applyPropsSlices.
          props_slices,
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

    const processedRows = processArrowResult(result);

    return {
      [insightName]: {
        name: insightName,
        data: processedRows,
        files,
        query,
        props_mapping,
        static_props, // Non-query props (e.g., marker.color: ["red", "green"])
        props_slices, // Per-prop slice suffixes (B13)
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
        props_slices: insight.props_slices || {},
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
 * @param {*} options.cacheKey - Extra key for React Query cache busting (e.g., runId)
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

  // Compute the relevant input values for every requested insight: the current
  // store values of the inputs each insight's query/static_props actually
  // reference, PLUS any inputs an insight is still pending on. This is the
  // SOLE refetch trigger for input-driven insights, and it is derived purely
  // from input *values* and insight *query metadata* — never from the
  // pending/resolved status the query result writes back. That distinction is
  // what prevents the VIS-831 feedback loop: a previous design also keyed the
  // query on a `pendingInsightInputsReady` boolean derived from the data the
  // query produced, so each store write flipped the key, swapped react-query
  // cache buckets (pending-vs-resolved `data`), and re-fired the store-write
  // effect indefinitely. By keying only on monotonic input values, the query
  // re-runs exactly when (a) metadata for an input-driven insight first lands
  // and (b) a relevant input value genuinely changes — and then settles.
  //
  // Folding pending inputs in preserves the original "refetch when a pending
  // insight's inputs become available" behaviour: when those inputs arrive,
  // their values enter this map and the key changes once.
  //
  // Unlike the prior implementation this does NOT bail to `{}` when some
  // requested name lacks insight metadata (e.g. a model-data table whose name
  // is grouped with insight names by the dashboard). Such names simply
  // contribute nothing here instead of zeroing out the whole map and silently
  // disabling the value-change refetch trigger.
  const relevantInputValues = useMemo(() => {
    if (!getInputs || !storeInsightData) return {};

    const knownInputNames = Object.keys(getInputs);
    const relevantInputs = {};

    for (const insightName of stableInsightNames) {
      const insight = storeInsightData[storeKeyPrefix + insightName];
      if (!insight) continue;

      if (insight.query || insight.static_props) {
        const deps = extractInputDependencies(
          insight.query,
          insight.static_props,
          knownInputNames
        );
        deps.forEach(inputName => {
          relevantInputs[inputName] = getInputs[inputName];
        });
      }

      // Inputs an insight is still waiting on: track their values too so the
      // pending→ready transition re-keys the query exactly once.
      if (insight.pendingInputs?.length) {
        insight.pendingInputs.forEach(inputName => {
          relevantInputs[inputName] = getInputs[inputName];
        });
      }
    }

    return relevantInputs;
  }, [getInputs, storeInsightData, stableInsightNames, storeKeyPrefix]);

  // Stable string representation of relevant inputs for the queryKey. Only
  // changes when an insight's relevant input *value* actually moves (or first
  // arrives), so the query re-runs deterministically and then settles.
  const stableRelevantInputs = useMemo(() => {
    return JSON.stringify(relevantInputValues);
  }, [relevantInputValues]);

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
  // The queryKey includes stableRelevantInputs to trigger refetch when relevant
  // inputs change (or first arrive for an input-driven insight). It deliberately
  // does NOT include any store-derived pending/resolved status: keying on a value
  // the query result writes back creates a feedback loop (VIS-831). Also includes
  // runId to separate cache for different runs and cacheKey for preview cache
  // busting (runId changes each preview run).
  const queryEnabled = !!projectId && stableInsightNames.length > 0 && !!db && !!runId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['insights', projectId, runId, stableInsightNames, !!db, stableRelevantInputs, cacheKey],
    queryFn,
    enabled: queryEnabled,
    staleTime: Infinity,
    gcTime: Infinity, // formerly cacheTime
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  // Update store when data arrives.
  //
  // Structural-equality guard (VIS-831 defense-in-depth): only write to the
  // store when the freshly-fetched jobs differ in CONTENT from what's already
  // there. react-query can hand back a new `data` object reference for the same
  // logical result (e.g. when the active cache bucket changes), and
  // `setInsightJobs` always produces a new `insightJobs` reference, which other
  // memos in this hook subscribe to. Bailing on content-equal writes keeps a
  // referentially-fresh-but-identical `data` from churning the store — while
  // still writing whenever the data genuinely changes (input/data refresh).
  useEffect(() => {
    if (!data || Object.keys(data).length === 0) return;

    const prefixed = storeKeyPrefix
      ? Object.fromEntries(
          Object.entries(data).map(([key, value]) => [storeKeyPrefix + key, value])
        )
      : data;

    const current = useStore.getState().insightJobs || {};
    const unchanged = Object.entries(prefixed).every(([key, value]) =>
      isEqual(current[key], value)
    );
    if (unchanged) return;

    setInsightJobs(prefixed);
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
