import { useEffect, useMemo } from 'react';
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

  const memoizedInsightNames = useMemo(
    () => insightNames,
    [insightNames?.join(',')]
  );

  const { data: insights, isLoading } = useQuery({
    queryKey: ['insight', projectId, memoizedInsightNames],
    queryFn: () => fetchInsight(projectId, memoizedInsightNames),
  });

  useEffect(() => {
    const waitForData = async () => {
      const fetchedInsightsData = await fetchInsightsData(insights);

      const orderedInsightData = memoizedInsightNames.reduce(
        (orderedJson, insightName) => {
          const insight = fetchedInsightsData[insightName]
          orderedJson[insightName] = {
            insight: insight.data ?? [],
            post_query: insight.post_query ?? `SELECT * FROM ${insightName}`,
          };
          return orderedJson;
        },
        {}
      );

      // cache into DuckDB
      for (const [insightName, dataObj] of Object.entries(orderedInsightData)) {
        await saveInsightData(db, insightName, dataObj);
      }

      setInsights(filterObject(orderedInsightData, memoizedInsightNames));
    };

    if (insights) {
      waitForData();
    }
  }, [isLoading, insights, memoizedInsightNames, db]);

  return insightData;
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
};
