import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTracesData } from '../queries/tracesData';
import { fetchTracesQuery } from '../api/traces';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

export const useTracesData = (projectId, traceNames) => {
  const [traceData, setTraceData] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedTraceNames = useMemo(() => traceNames, [traceNames?.join(',')]);

  const { data: traces, isLoading } = useQuery({
    queryKey: ['trace', projectId, memoizedTraceNames],
    queryFn: () => fetchTracesQuery(projectId, memoizedTraceNames),
  });

  useEffect(() => {
    const waitForData = async () => {
      const fetchedTracesData = await fetchTracesData(traces);
      const orderedTracesData = memoizedTraceNames.reduce((orderedJson, traceName) => {
        orderedJson[traceName] = fetchedTracesData[traceName];
        return orderedJson;
      }, {});
      setTraceData(filterObject(orderedTracesData, memoizedTraceNames));
    };
    if (traces) {
      waitForData();
    }
  }, [isLoading, traces, memoizedTraceNames]);

  return traceData;
};
