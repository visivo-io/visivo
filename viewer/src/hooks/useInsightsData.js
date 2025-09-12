import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import { fetchInsightsData } from '../queries/insightsData';
import { tableDuckDBExists } from '../duckdb/queries';
import { insertDuckDBFile } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

export const useInsightsData = (projectId, insightNames) => {
  const fetchInsight = useFetchInsights();
  const db = useDuckDB();
  const {
    setInsights,
  } = useStore();
  
  const insightData = useStore(state => state.insights);
  const [isProcessingData, setIsProcessingData] = useState(false);

  const memoizedInsightNames = useMemo(
    () => insightNames,
    [insightNames?.join(',')]
  );

  const { data: insights, isLoading: isQueryLoading } = useQuery({
    queryKey: ['insight', projectId, memoizedInsightNames],
    queryFn: () => fetchInsight(projectId, memoizedInsightNames),
    enabled: memoizedInsightNames && memoizedInsightNames.length > 0,
  });

  useEffect(() => {
    const waitForData = async () => {
      if (!insights || memoizedInsightNames.length === 0) return;
      
      setIsProcessingData(true);
      
      try {
        const fetchedInsightsData = await fetchInsightsData(insights);

        const orderedInsightData = memoizedInsightNames.reduce(
          (orderedJson, insightName) => {
            const insight = fetchedInsightsData[insightName]
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

        // cache into DuckDB
        for (const [insightName, dataObj] of Object.entries(orderedInsightData)) {
          await saveInsightData(db, insightName, dataObj);
        }

        setInsights(filterObject(orderedInsightData, memoizedInsightNames));
      } catch (error) {
        console.error('Error processing insights data:', error);
      } finally {
        setIsProcessingData(false);
      }
    };

    if (insights && !isQueryLoading) {
      waitForData();
    }
  }, [insights, isQueryLoading, memoizedInsightNames, db, setInsights]);

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

  const isInsightsLoading = isQueryLoading || isProcessingData || !hasAllInsightData;

  return {
    insightsData: insightData,
    isInsightsLoading,
    hasAllInsightData
  };
};

/**
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {string} insightName
 * @param {Object} dataObj
 */
const saveInsightData = async (db, insightName, dataObj) => {
  if (!db || !insightName || !dataObj) return;
  await cacheInsightData(db, insightName, dataObj);
};

/**
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {string} insightName
 * @param {Object} dataObj
 */
const cacheInsightData = async (db, insightName, dataObj) => {
  try {
    const exists = await tableDuckDBExists(db, insightName);
    if (exists) {
      console.log(`Table ${insightName} already exists ✅`);
      return;
    }

    const jsonBlob = new Blob([JSON.stringify(dataObj.insight)], {
      type: 'application/json',
    });
    const file = new File([jsonBlob], `${insightName}.json`, {
      type: 'application/json',
    });

    await insertDuckDBFile(db, file, insightName);
    console.log(`Inserted ${insightName} into DuckDB`);
  } catch (error) {
    console.error(`Error caching insight data for ${insightName}:`, error);
  }
};