import { useState, useEffect, useContext, useMemo } from 'react';
import QueryContext from '../contexts/QueryContext';
import { useQuery } from '@tanstack/react-query';
import { fetchTracesData } from '../queries/tracesData';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

export const useTracesData = (projectId, traceNames) => {
  const { fetchTracesQuery } = useContext(QueryContext);
  const [traceData, setTraceData] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedTraceNames = useMemo(() => traceNames, [traceNames?.join(',')]);

  const { data: traces, isLoading } = useQuery(fetchTracesQuery(projectId, memoizedTraceNames));

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
