import React, { useState, useEffect, useContext } from "react";
import Plot from 'react-plotly.js';
import { cleanedPlotData } from '../../models/Trace'
import FetchTraceQueryContext from "../../contexts/FetchTraceQueryContext";
import { useQuery } from '@tanstack/react-query'

const Chart = (props) => {
    const fetchTraceQuery = useContext(FetchTraceQueryContext)
    const [traceData, setTraceData] = useState(null)

    const { data: traces } = useQuery(fetchTraceQuery(props.project.id, props.traceNames))
    useEffect(() => {
        const fetchData = async () => {
            if (traceNames.length === 0) {
                setTraceData({})
                return
            }
            const returnJson = {};
            Promise.all(
                traces.map(async (trace) => {
                    const traceResponse = await fetch(trace.signed_data_file_url);
                    const traceJson = await traceResponse.json();
                    returnJson[trace.name] = traceJson;
                })
            ).then(() => {
                setTraceData(returnJson)
            })
        }
        const traceNames = [] //Pull from traces
        fetchData();
    }, [traces]);

    //SHOW LOADING

    const plotData = () => {
        return props.chart.traces.map((trace) => {
            return cleanedPlotData(traceData, trace)
        }).flat();
    }

    return (
        <Plot
            key={`chart_${props.chart.name}`}
            data-testid={`chart_${props.chart.name}`}
            data={plotData()}
            layout={{ ...props.chart.layout, height: props.height, width: props.width }}
            useResizeHandler={true}
            config={{ displayModeBar: false }}
        />
    );
}

export default Chart;
