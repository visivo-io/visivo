import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInsights } from '../contexts/QueryContext';
import { fetchInsightsData } from '../queries/insightsData';
import { useDuckDB } from '../contexts/DuckDBContext';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

export const useInsightsData = (projectId, insightNames) => {
  const [insightData, setTraceData] = useState(null);
  const fetchInsight = useFetchInsights();
  const db = useDuckDB();

  useEffect(() => {
    console.log("db: ", db)
    if (!db) return;
    (async () => {
      const conn = await db.connect();
      await conn.query("CREATE TABLE fruits (id INT, name TEXT)");
      await conn.query("INSERT INTO fruits VALUES (1, 'Mango'), (2, 'Banana')");
      const result = await conn.query("SELECT * FROM fruits");
      console.log(result.toArray());
      await conn.close();
    })();
  }, [db]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedInsightNames = useMemo(() => insightNames, [insightNames?.join(',')]);

  const { data: insights, isLoading } = useQuery({
    queryKey: ['insight', projectId, memoizedInsightNames],
    queryFn: () => fetchInsight(projectId, memoizedInsightNames),
  });

  useEffect(() => {
    const waitForData = async () => {
      const fetchedInsightsData = await fetchInsightsData(insights);
      const orderedInsightData = memoizedInsightNames.reduce((orderedJson, insightName) => {
        orderedJson[insightName] = fetchedInsightsData[insightName];
        return orderedJson;
      }, {});
      setTraceData(filterObject(orderedInsightData, memoizedInsightNames));
    };
    if (insights) {
      waitForData();
    }
  }, [isLoading, insights, memoizedInsightNames]);

  return insightData;
};
