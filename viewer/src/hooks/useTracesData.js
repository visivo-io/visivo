import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTracesData } from '../queries/tracesData';
import { useFetchTraces } from '../contexts/QueryContext';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

export const useTracesData = (traces, projectId = null) => {
  const [traceData, setTraceData] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const fetchTraces = useFetchTraces();

  // Extract trace names from traces array
  const memoizedTraceNames = useMemo(() => {
    if (!traces || !Array.isArray(traces)) return [];
    return traces.map(trace => trace.name);
  }, [traces]);

  // projectId is now passed as parameter with default null

  const { data: traceObjects, isLoading: isQueryLoading } = useQuery({
    queryKey: ['trace', projectId, memoizedTraceNames],
    queryFn: () => fetchTraces(projectId, memoizedTraceNames),
    enabled: Boolean(traces && traces.length > 0 && memoizedTraceNames.length > 0),
  });

  useEffect(() => {
    const waitForData = async () => {
      if (!traceObjects || !Array.isArray(traceObjects)) return;
      
      setIsDataLoading(true);
      try {
        const fetchedTracesData = await fetchTracesData(traceObjects);
        const orderedTracesData = memoizedTraceNames.reduce((orderedJson, traceName) => {
          orderedJson[traceName] = fetchedTracesData[traceName];
          return orderedJson;
        }, {});
        setTraceData(filterObject(orderedTracesData, memoizedTraceNames));
      } catch (error) {
        console.error('Failed to fetch traces data:', error);
        setTraceData(null);
      } finally {
        setIsDataLoading(false);
      }
    };

    if (traceObjects && !isQueryLoading) {
      waitForData();
    }
  }, [traceObjects, isQueryLoading, memoizedTraceNames]);

  // Return the expected interface: { data, isLoading }
  // If there are no traces, we shouldn't be loading
  const hasTraces = Boolean(traces && traces.length > 0);
  
  return {
    data: traceData,
    isLoading: hasTraces ? (isQueryLoading || isDataLoading) : false
  };
};
