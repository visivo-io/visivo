import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import { tableDuckDBExists, insertDuckDBFile } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

// Global cache to prevent duplicate operations across all instances
const globalOperationCache = new Map();
const globalResultCache = new Map();

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

// Create a stable string key that won't change unless content changes
const createStableKey = (projectId, insightNames) => {
  if (!insightNames?.length) return `${projectId}-empty`;
  const sorted = [...insightNames].sort().join(',');
  return `${projectId}-${sorted}`;
};

export const useInsightsData = (projectId, insightNames) => {
  const fetchInsight = useFetchInsights();
  const db = useDuckDB();
  const setInsights = useStore(state => state.setInsights);
  const storeInsightData = useStore(state => state.insights);

  // Create ultra-stable key that only changes when actual content changes
  const stableKeyRef = useRef(null);
  const lastInsightNamesStringRef = useRef(null);

  const requestKey = useMemo(() => {
    const insightNamesString = JSON.stringify([...(insightNames || [])].sort());

    if (lastInsightNamesStringRef.current !== insightNamesString) {
      lastInsightNamesStringRef.current = insightNamesString;
      stableKeyRef.current = createStableKey(projectId, insightNames);
    }

    return stableKeyRef.current;
  }, [projectId, insightNames]);

  // Extract stable insight names array
  const stableInsightNames = useMemo(() => {
    if (!insightNames?.length) return [];
    return [...insightNames].sort();
  }, [insightNames]);
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

  // Single query that handles everything
  const { data, isLoading, error } = useQuery({
    queryKey: ['completeInsightData', requestKey],
    queryFn: async () => {
      // Check global cache first
      if (globalResultCache.has(requestKey)) {
        const cachedData = globalResultCache.get(requestKey);
        setInsights(cachedData);
        return cachedData;
      }

      // Check if already processing
      if (globalOperationCache.has(requestKey)) {
        // Wait for other instance to complete
        await globalOperationCache.get(requestKey);
        if (globalResultCache.has(requestKey)) {
          const cachedData = globalResultCache.get(requestKey);
          setInsights(cachedData);
          return cachedData;
        }
      }

      // Create processing promise
      const processingPromise = (async () => {
        try {
          // Step 1: Get metadata
          const insights = await fetchInsight(projectId, stableInsightNames);

          if (!insights?.length) {
            return {};
          }

          // Step 2: Fetch all insight data in parallel
          const dataPromises = insights.map(async insight => {
            try {
              const data = await fetchInsightData(insight);
              return { insight, data };
            } catch (error) {
              console.error(`Failed to fetch ${insight.name}:`, error);
              return null;
            }
          });

          const results = await Promise.all(dataPromises);

          // Step 3: Process and structure the data
          const processedData = {};

          results.forEach(result => {
            if (result && result.data) {
              const { insight, data } = result;
              processedData[insight.name] = {
                insight: data.data ?? [],
                post_query: data.post_query ?? `SELECT * FROM ${insight.name}`,
                columns: data.metadata?.columns || {},
                props: data.metadata?.props || {},
              };
            }
          });

          // Filter to only requested insights
          const filteredData = filterObject(processedData, stableInsightNames);

          // Step 4: Cache in DuckDB (fire and forget)
          if (db) {
            setTimeout(() => {
              Object.entries(filteredData).forEach(([name, dataObj]) => {
                saveInsightDataSafe(db, name, dataObj);
              });
            }, 0);
          }

          // Step 5: Cache result globally and update store
          globalResultCache.set(requestKey, filteredData);
          setInsights(filteredData);

          return filteredData;
        } catch (error) {
          console.error('Error in insight processing:', error);
          throw error;
        }
      })();

      // Store processing promise
      globalOperationCache.set(requestKey, processingPromise);

      try {
        const result = await processingPromise;
        return result;
      } finally {
        // Clean up processing cache after delay
        setTimeout(() => {
          globalOperationCache.delete(requestKey);
        }, 5000);
      }
    },
    enabled: !!projectId && stableInsightNames.length > 0 && !hasCompleteData,
    staleTime: Infinity, // Never refetch once we have data
    cacheTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false, // Don't retry on failure to avoid cascading issues
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
