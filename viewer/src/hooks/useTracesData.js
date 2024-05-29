import { useState, useEffect, useContext, useMemo } from "react";
import FetchTracesQueryContext from "../contexts/FetchTracesQueryContext";
import { useQuery } from '@tanstack/react-query';
import { fetchTracesData } from "../queries/tracesData";

function filterObject(obj, keys) {
    return Object.fromEntries(
        Object.entries(obj).filter(([key]) => keys.includes(key))
    );
}

export const useTracesData = (projectId, traceNames) => {
    const fetchTraceQuery = useContext(FetchTracesQueryContext);
    const [traceData, setTraceData] = useState(null);

    const memoizedTraceNames = useMemo(() => traceNames, [traceNames.join(",")]);

    console.log(memoizedTraceNames)

    const { data: traces } = useQuery(fetchTraceQuery(projectId, memoizedTraceNames));

    useEffect(() => {
        const waitForData = async () => {
            const fetchedTracesData = await fetchTracesData(traces);
            setTraceData(filterObject(fetchedTracesData, memoizedTraceNames));
        };
        if (traces) {
            waitForData();
        }
    }, [traces, memoizedTraceNames]);

    return traceData;
};