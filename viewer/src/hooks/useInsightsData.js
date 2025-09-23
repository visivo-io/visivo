import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import { tableDuckDBExists, insertDuckDBFile } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { fetchInsightData } from '../queries/insightsData';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

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
    if (!error.message?.includes('already exists')) {
      console.error(`Failed to cache ${insightName}:`, error);
    }
  }
};

export const useInsightsData = (projectId, insightNames) => {
  const fetchInsight = useFetchInsights();
  const db = useDuckDB();
  const setInsights = useStore((state) => state.setInsights);
  const storeInsightData = useStore((state) => state.insights);

  const stableInsightNames = useMemo(() => {
    if (!insightNames?.length) return [];
    return [...insightNames].sort();
  }, [insightNames]);

  const hasCompleteData = useMemo(() => {
    if (!stableInsightNames.length) return true;
    if (!storeInsightData) return false;

    return stableInsightNames.every(
      (name) =>
        storeInsightData[name]?.insight &&
        storeInsightData[name]?.columns &&
        storeInsightData[name]?.props
    );
  }, [storeInsightData, stableInsightNames]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['insights', projectId, stableInsightNames],
    queryFn: async () => {
      // if (!db) return
      const insights = await fetchInsight(projectId, stableInsightNames);
      if (!insights?.length) return {};

      const results = await Promise.all(
        insights.map(async (insight) => {
          try {
            const data = await fetchInsightData(insight);
            return [
              insight.name,
              {
                insight: data.data ?? [],
                post_query: data.post_query ?? `SELECT * FROM "${insight.name}"`,
                columns: data.metadata?.columns || {},
                props: data.metadata?.props || {},
              },
            ];
          } catch (error) {
            console.error(`Failed to fetch ${insight.name}:`, error);
            return null;
          }
        })
      );

      const processedData = Object.fromEntries(
        results.filter((r) => r !== null)
      );

      const filteredData = filterObject(processedData, stableInsightNames);

      // Fire-and-forget caching into DuckDB
      if (db) {
        setTimeout(() => {
          Object.entries(filteredData).forEach(([name, dataObj]) => {
            saveInsightDataSafe(db, name, dataObj);
          });
        }, 0);
      }

      setInsights(filteredData);
      return filteredData;
    },
    enabled: !!projectId && stableInsightNames.length > 0 && !hasCompleteData,
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  return {
    insightsData: hasCompleteData ? storeInsightData : data || {},
    isInsightsLoading: hasCompleteData ? false : isLoading,
    hasAllInsightData:
      hasCompleteData || (data && Object.keys(data).length > 0),
    error,
  };
};

export const fetchInsightsData = async (insights) => {
  if (!insights?.length) return {};

  const results = await Promise.allSettled(
    insights.map(async (insight) => {
      const response = await fetch(insight.signed_data_file_url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return [insight.name, data];
    })
  );

  return Object.fromEntries(
    results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
  );
};
