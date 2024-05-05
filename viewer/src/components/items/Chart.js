import React, { useState } from "react";
import Plot from 'react-plotly.js';
import { cleanedPlotData } from '../../models/Trace'
import Loading from "../Loading";
import { useTracesData } from "../../hooks/useTracesData";
import TraceSelect from "./TraceSelect";
import tw from "tailwind-styled-components"

export const ChartContainer = tw.aside`
   flex
   flex-col
   m-auto
`;

const Chart = (props) => {
    const traceNames = props.chart.traces.map((trace) => trace.name)
    const tracesData = useTracesData(props.project.id, traceNames)
    const [selectedTracesData, setSelectedTracesData] = useState({})

    if (!tracesData) {
        return <Loading></Loading>
    }

    const plotData = () => {
        return props.chart.traces.map((trace) => {
            return cleanedPlotData(tracesData, trace)
        }).flat();
    }

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        setSelectedTracesData(changedSelectedTracesData)
    }

    return (
        <ChartContainer>
            <TraceSelect plotData={plotData()} onChange={onSelectedCohortChange} isMulti={true} />
            <Plot
                key={`chart_${props.chart.name}`}
                data-testid={`chart_${props.chart.name}`}
                data={selectedTracesData}
                layout={{ ...props.chart.layout, height: props.height, width: props.width }}
                useResizeHandler={true}
                config={{ displayModeBar: false }}
            />
        </ChartContainer>
    );
}

export default Chart;
