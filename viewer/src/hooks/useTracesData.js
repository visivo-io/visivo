import { useState, useEffect, useContext } from "react";
import FetchTracesQueryContext from "../contexts/FetchTracesQueryContext";
import { useQuery } from '@tanstack/react-query'
import { fetchTracesData } from "../queries/tracesData";

function filterObject(obj, keys) {
    return Object.fromEntries(
        Object.entries(obj).filter(([key]) => keys.includes(key))
    );
}

export const useTracesData = (projectId, traceNames) => {
    const fetchTraceQuery = useContext(FetchTracesQueryContext)
    const [traceData, setTraceData] = useState(null)

    const { data: traces } = useQuery(fetchTraceQuery(projectId, traceNames))

    useEffect(() => {
        const waitForData = async () => {
            const fetchedTracesData = await fetchTracesData(traces)
            setTraceData(filterObject(fetchedTracesData, traceNames));
        }
        if (traces) {
            console.log("traces")
            waitForData()
        }
    }, [traces, traceNames]);

    if (!traceData) {
        return null
    }
    return traceData;
};