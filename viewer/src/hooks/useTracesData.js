import React, { useState, useEffect, useContext } from "react";
import FetchTracesQueryContext from "../contexts/FetchTracesQueryContext";
import { useQuery } from '@tanstack/react-query'
import { fetchTracesData } from "../queries/tracesData";

export const useTracesData = (projectId, traceNames) => {
    const fetchTraceQuery = useContext(FetchTracesQueryContext)
    const [traceData, setTraceData] = useState(null)

    const { data: traces } = useQuery(fetchTraceQuery(projectId, traceNames))

    useEffect(() => {
        if (traces) {
            setTraceData(fetchTracesData(traces));
        }
    }, [traces]);

    if (!traceData) {
        return null
    }
    return [
        traceData
    ];
};