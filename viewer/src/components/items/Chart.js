import Loading from "../Loading";
import Menu from "./Menu"
import Plot from 'react-plotly.js';
import React, { useState } from "react";
import TraceSelect from "./TraceSelect";
import tw from "tailwind-styled-components"
import { cleanedPlotData } from '../../models/Trace'
import { useTracesData } from "../../hooks/useTracesData";

import MenuItem from "../styled/MenuItem";

export const ChartContainer = tw.div`
    relative
`;

const Chart = (props) => {
    const traceNames = props.chart.traces.map((trace) => trace.name)
    const tracesData = useTracesData(props.project.id, traceNames)
    const [hovering, setHovering] = useState(false)

    const [selectedPlotData, setSelectedPlotData] = useState([])

    const plotData = () => {
        return props.chart.traces.map((trace) => {
            return cleanedPlotData(tracesData, trace)
        }).flat();
    }

    if (!tracesData) {
        return <Loading text={props.chart.name} width={props.itemWidth} />
    }

    const initialPlotData = plotData()

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        setSelectedPlotData(changedSelectedTracesData)
    }

    return (
        <ChartContainer onMouseOver={() => setHovering(true)} onMouseOut={() => setHovering(false)}>
            <Menu hovering={hovering}>
                <MenuItem>
                    <TraceSelect plotData={initialPlotData} onChange={onSelectedCohortChange} isMulti={true} />
                </MenuItem>
            </Menu>
            <Plot
                key={`chart_${props.chart.name}`}
                data-testid={`chart_${props.chart.name}`}
                data={selectedPlotData}
                layout={{ ...props.chart.layout, height: props.height, width: props.width }}
                useResizeHandler={true}
                config={{ displayModeBar: false }}
            />
        </ChartContainer>
    );
}

export default Chart;
