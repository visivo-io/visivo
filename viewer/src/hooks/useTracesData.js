import { useState, useEffect, useContext, useMemo } from "react";
import FetchTracesQueryContext from "../contexts/FetchTracesQueryContext";
import { useQuery, useQueries } from '@tanstack/react-query';
import { fetchTraceData } from "../queries/tracesData";

function filterObject(obj, keys) {
    return Object.fromEntries(
        Object.entries(obj).filter(([key]) => keys.includes(key))
    );
}

export const useTracesData = (projectId, traceNames) => {
    const fetchTraceQuery = useContext(FetchTracesQueryContext);
    const [traceData, setTraceData] = useState(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const memoizedTraceNames = useMemo(() => traceNames, [traceNames?.join(",")]);

    const { data: traces } = useQuery(fetchTraceQuery(projectId, memoizedTraceNames));

    let queries = [];
    if (traces) {
        queries = traces.map((trace) => ({
            queryKey: ['trace', trace.id],
            queryFn: () => fetchTraceData(trace),
            staleTime: Infinity,
        }));
    }

    const results = useQueries({
        queries: queries,
    })
    const loaded = results.every(result => result.isSuccess);

    useEffect(() => {
        if (loaded) {
            const data = {};
            results.forEach(result => data[result.data[0]] = result.data[1]);
            console.log(data);
            setTraceData(filterObject(data, memoizedTraceNames));
        }
    }, [loaded, memoizedTraceNames]);

    return traceData;
};