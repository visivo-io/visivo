import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import { tableDuckDBExists, insertDuckDBFile } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

const GLOBAL_CACHE = new Map();
const PROCESSING_CACHE = new Set();

const fetchInsightData = async insight => {
  const response = await fetch(insight.signed_data_file_url);
  if (!response.ok) {
    throw new Error(`Failed to fetch insight data for ${insight.name}`);
  }
  return response.json();
};

const saveInsightDataSafe = async (db, insightName, dataObj) => {
  if (!db || !insightName || !dataObj?.insight) return;

  try {
    const exists = await tableDuckDBExists(db, insightName).catch(() => false);
    if (exists) return;

    const jsonBlob = new Blob([JSON.stringify(dataObj.insight)], {
      type: 'application/json',
    });

    const file = new File([jsonBlob], `${insightName}.json`, {
      type: 'application/json',
    });

    await insertDuckDBFile(db, file, insightName);
  } catch (error) {
    // Silently handle "already exists" errors
    if (!error.message?.includes('already exists')) {
      console.error(`Failed to cache ${insightName}:`, error);
    }
  }
};

// Create completely stable key based on content, not references
const createContentBasedKey = (projectId, insightNames) => {
  if (!projectId || !insightNames?.length) return null;

  // Sort and stringify to ensure consistent keys regardless of array reference
  const sortedNames = [...insightNames].sort();
  return `${projectId}::${JSON.stringify(sortedNames)}`;
};

export const useInsightsData = (projectId, insightNames) => {
  const fetchInsight = useFetchInsights();
  const db = useDuckDB();
  const setInsights = useStore(state => state.setInsights);
  const storeInsightData = useStore(state => state.insights);

  // Use refs to store values that shouldn't trigger rerenders
  const lastKeyRef = useRef(null);
  const stableKeyRef = useRef(null);

  // Create stable key that only changes when actual content changes
  const contentBasedKey = useMemo(() => {
    const newKey = createContentBasedKey(projectId, insightNames);

    // Only update if the serialized content is actually different
    if (newKey && newKey !== lastKeyRef.current) {
      lastKeyRef.current = newKey;
      stableKeyRef.current = newKey;
    }

    return stableKeyRef.current;
  }, [projectId, insightNames]);

  // Extract stable insight names using the content-based key
  const stableInsightNames = useMemo(() => {
    if (!contentBasedKey || !insightNames?.length) return [];
    // Parse the key to get the names (this ensures they're consistent)
    try {
      const keyParts = contentBasedKey.split('::');
      if (keyParts.length === 2) {
        return JSON.parse(keyParts[1]);
      }
    } catch (e) {
      console.warn('Failed to parse content key:', e);
    }
    return [...insightNames].sort();
  }, [contentBasedKey, insightNames]);

  // Check if we have complete data already
  const hasCompleteData = useMemo(() => {
    if (!stableInsightNames.length) return true;
    if (!storeInsightData) return false;

    return stableInsightNames.every(
      name =>
        storeInsightData[name]?.insight &&
        storeInsightData[name]?.columns &&
        storeInsightData[name]?.props
    );
  }, [storeInsightData, stableInsightNames]);

  // Single query that handles everything with aggressive caching
  const { data, isLoading, error } = useQuery({
    queryKey: ['insights-complete', contentBasedKey],
    queryFn: async () => {
      // Return early if no valid key
      if (!contentBasedKey) return {};

      // Check global cache first
      if (GLOBAL_CACHE.has(contentBasedKey)) {
        const cachedData = GLOBAL_CACHE.get(contentBasedKey);
        setInsights(cachedData);
        return cachedData;
      }

      // Prevent duplicate processing
      if (PROCESSING_CACHE.has(contentBasedKey)) {
        throw new Error('Already processing this request');
      }

      PROCESSING_CACHE.add(contentBasedKey);

      try {
        // Step 1: Get metadata
        console.log(`Fetching insights for: ${stableInsightNames.join(', ')}`);
        const insights = await fetchInsight(projectId, stableInsightNames);

        if (!insights?.length) {
          GLOBAL_CACHE.set(contentBasedKey, {});
          return {};
        }

        // Step 2: Fetch all insight data in parallel
        const dataResults = await Promise.allSettled(
          insights.map(async insight => {
            try {
              const data = await fetchInsightData(insight);
              return { insight, data, success: true };
            } catch (error) {
              console.error(`Failed to fetch ${insight.name}:`, error);
              return { insight, error, success: false };
            }
          })
        );

        // Step 3: Process successful results
        const processedData = {};

        dataResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            const { insight, data } = result.value;
            processedData[insight.name] = {
              insight: data.data ?? [],
              post_query: data.post_query ?? `SELECT * FROM ${insight.name}`,
              columns: data.metadata?.columns || {},
              props: data.metadata?.props || {},
            };
          }
        });

        // Step 4: Filter to only requested insights
        const filteredData = filterObject(processedData, stableInsightNames);

        // Step 5: Cache in DuckDB asynchronously (fire and forget)
        if (db) {
          setTimeout(() => {
            Object.entries(filteredData).forEach(([name, dataObj]) => {
              saveInsightDataSafe(db, name, dataObj);
            });
          }, 100);
        }

        // Step 6: Cache result globally and update store
        GLOBAL_CACHE.set(contentBasedKey, filteredData);
        setInsights(filteredData);

        console.log(`Successfully processed ${Object.keys(filteredData).length} insights`);
        return filteredData;
      } finally {
        // Clean up processing cache
        PROCESSING_CACHE.delete(contentBasedKey);
      }
    },
    enabled: !!contentBasedKey && !hasCompleteData,
    staleTime: Infinity, // Never refetch once we have data
    cacheTime: Infinity, // Keep in React Query cache forever
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (failureCount, error) => {
      // Don't retry if already processing
      if (error.message === 'Already processing this request') {
        return false;
      }
      return failureCount < 2; // Only retry twice
    },
    retryDelay: 1000,
  });

  return {
    insightsData: hasCompleteData ? storeInsightData : data || {},
    isInsightsLoading: hasCompleteData ? false : isLoading,
    hasAllInsightData: hasCompleteData || (data && Object.keys(data).length > 0),
    error,
  };
};

export const fetchInsightsData = async insights => {
  if (!insights?.length) return {};

  const results = await Promise.allSettled(
    insights.map(async insight => {
      const response = await fetch(insight.signed_data_file_url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return [insight.name, data];
    })
  );

  return Object.fromEntries(
    results.filter(result => result.status === 'fulfilled').map(result => result.value)
  );
};
