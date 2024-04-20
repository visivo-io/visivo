import React from "react";
import Plot from 'react-plotly.js';
import { cleanedPlotData } from '../../models/Trace'
import Loading from "../Loading";
import { useTracesData } from "../../hooks/useTracesData";

const Chart = (props) => {
    const traceNames = props.chart.traces.map((trace) => trace.name)
    const tracesData = useTracesData(props.project.id, traceNames)

    if (!tracesData) {
        return <Loading></Loading>
    }

    const plotData = () => {
        return props.chart.traces.map((trace) => {
            return cleanedPlotData(tracesData, trace)
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
