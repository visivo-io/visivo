import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import { tableDuckDBExists } from '../duckdb/queries';
import { insertDuckDBFile } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

// Extract individual insight data fetching
const fetchInsightData = async (insight) => {
  const response = await fetch(insight.signed_data_file_url);
  if (!response.ok) {
    throw new Error(`Failed to fetch insight data for ${insight.name}`);
  }
  return response.json();
};

export const useInsightsData = (projectId, insightNames) => {
  const fetchInsight = useFetchInsights();
  const db = useDuckDB();
  const { setInsights } = useStore();
  
  const insightData = useStore(state => state.insights);
  const [isProcessingData, setIsProcessingData] = useState(false);

  const memoizedInsightNames = useMemo(
    () => insightNames,
    [insightNames]
  );

  // First query: Get insight metadata
  const { data: insights, isLoading: isInsightsMetaLoading } = useQuery({
    queryKey: ['insight', projectId, memoizedInsightNames],
    queryFn: () => fetchInsight(projectId, memoizedInsightNames),
    enabled: memoizedInsightNames && memoizedInsightNames.length > 0,
  });

  const insightDataQueries = useQueries({
    queries: (insights || []).map(insight => ({
      queryKey: ['insightData', insight.name, insight.signed_data_file_url],
      queryFn: () => fetchInsightData(insight),
      enabled: !!insight?.signed_data_file_url,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
    }))
  });

  const isDataQueriesLoading = insightDataQueries.some(query => query.isLoading);
  const dataQueriesError = insightDataQueries.find(query => query.error);

  useEffect(() => {
    const processData = async () => {
      if (!insights || memoizedInsightNames.length === 0) return;
      if (isDataQueriesLoading || dataQueriesError) return;
      
      // Check if all data queries are successful
      const allDataLoaded = insightDataQueries.every(query => query.isSuccess && query.data);
      if (!allDataLoaded) return;

      setIsProcessingData(true);
      
      try {
        // Combine insights metadata with their data
        const fetchedInsightsData = {};
        insights.forEach((insight, index) => {
          const queryResult = insightDataQueries[index];
          if (queryResult.isSuccess) {
            fetchedInsightsData[insight.name] = queryResult.data;
          }
        });

        const orderedInsightData = memoizedInsightNames.reduce(
          (orderedJson, insightName) => {
            const insight = fetchedInsightsData[insightName];
            if (insight) {
              orderedJson[insightName] = {
                insight: insight.data ?? [],
                post_query: insight.post_query ?? `SELECT * FROM ${insightName}`,
                columns: insight.metadata?.columns || {},
                props: insight.metadata?.props || {}
              };
            }
            return orderedJson;
          },
          {}
        );

        // Cache into DuckDB with better error handling
        await Promise.allSettled(
          Object.entries(orderedInsightData).map(async ([insightName, dataObj]) => {
            try {
              await saveInsightData(db, insightName, dataObj);
            } catch (error) {
              console.error(`Failed to cache ${insightName}:`, error);
              // Don't fail the entire operation for one cache failure
            }
          })
        );

        setInsights(filterObject(orderedInsightData, memoizedInsightNames));
      } catch (error) {
        console.error('Error processing insights data:', error);
      } finally {
        setIsProcessingData(false);
      }
    };

    processData();
  }, [
    insights, 
    insightDataQueries, 
    isDataQueriesLoading, 
    dataQueriesError, 
    memoizedInsightNames, 
    db, 
    setInsights
  ]);

  // Check if we have all the required insight data
  const hasAllInsightData = useMemo(() => {
    if (!memoizedInsightNames || memoizedInsightNames.length === 0) return true;
    if (!insightData) return false;
    
    return memoizedInsightNames.every(name => 
      insightData[name] && 
      insightData[name].insight && 
      insightData[name].columns && 
      insightData[name].props
    );
  }, [insightData, memoizedInsightNames]);

  const isInsightsLoading = isInsightsMetaLoading || isDataQueriesLoading || isProcessingData || !hasAllInsightData;

  return {
    insightsData: insightData,
    isInsightsLoading,
    hasAllInsightData,
    error: dataQueriesError?.error || null
  };
};

/**
 * Cache insight data in DuckDB
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {string} insightName
 * @param {Object} dataObj
 */
const saveInsightData = async (db, insightName, dataObj) => {
  if (!db || !insightName || !dataObj) {
    throw new Error('Missing required parameters for saveInsightData');
  }
  
  try {
    const exists = await tableDuckDBExists(db, insightName);
    if (exists) {
      console.log(`Table ${insightName} already exists`);
      return;
    }

    // Validate data before creating blob
    if (!Array.isArray(dataObj.insight)) {
      throw new Error(`Invalid data format for ${insightName}: insight must be an array`);
    }

    const jsonBlob = new Blob([JSON.stringify(dataObj.insight)], {
      type: 'application/json',
    });
    
    const file = new File([jsonBlob], `${insightName}.json`, {
      type: 'application/json',
    });

    await insertDuckDBFile(db, file, insightName);
    console.log(`Successfully cached ${insightName} in DuckDB`);
    
  } catch (error) {
    console.error(`Failed to cache ${insightName}:`, error);
    throw error; // Re-throw to handle in calling code
  }
};

export const fetchInsightsData = async (insights) => {  
  if (!insights || insights.length === 0) {
    return {};
  }
  
  const returnJson = {};
  await Promise.all(
    insights.map(async insight => {
      try {
        const insightResponse = await fetch(insight.signed_data_file_url);
        if (!insightResponse.ok) {
          throw new Error(`HTTP error! status: ${insightResponse.status}`);
        }
        const insightJson = await insightResponse.json();
        returnJson[insight.name] = insightJson;
      } catch (error) {
        console.error(`Failed to fetch insight ${insight.name}:`, error);
      }
    })
  );
  return returnJson;
};