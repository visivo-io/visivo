import Plot from 'react-plotly.js';
import React from "react";
import { cleanedPlotData } from '../../models/Trace'

const Chart = (props) => {
    const plotData = () => {
        return props.chart.traces.map((trace) => {
            return cleanedPlotData(props.traceData, trace)
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
