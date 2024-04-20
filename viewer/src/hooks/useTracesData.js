import React, { useState, useEffect, useContext } from "react";
import FetchTraceQueryContext from "../contexts/FetchTraceQueryContext";
import { useQuery } from '@tanstack/react-query'
import { fetchTracesData } from "../queries/tracesData";

export const useTracesData = (projectId, traceNames) => {
    const fetchTraceQuery = useContext(FetchTraceQueryContext)
    const [traceData, setTraceData] = useState(null)

    const { data: traces } = useQuery(fetchTraceQuery(projectId, traceNames))

    useEffect(() => {
        if (traces) {
            setTraceData(fetchTracesData(traces));
        }
    }, [traces]);

    return [
        traceData
    ];
};