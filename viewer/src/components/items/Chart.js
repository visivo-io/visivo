import Loading from "../Loading";
import Menu from "./Menu"
import Plot from 'react-plotly.js';
import React, { useState } from "react";
import CohortSelect from "./CohortSelect";
import { traceNamesInData, chartDataFromCohortData } from "../../models/Trace";
import tw from "tailwind-styled-components"
import { useTracesData } from "../../hooks/useTracesData";
import MenuItem from "../styled/MenuItem";

export const ChartContainer = tw.div`
    relative
`;

const Chart = (props) => {
    const traceNames = props.chart.traces.map((trace) => trace.name)
    const tracesData = useTracesData(props.project.id, traceNames)
    const [hovering, setHovering] = useState(false)

    const [selectedCohortData, setSelectedCohortData] = useState([])

    if (!tracesData) {
        return <Loading text={props.chart.name} width={props.itemWidth} />
    }

    const selectedPlotData = traceNamesInData(selectedCohortData).map((traceName) => {
        const trace = props.chart.traces.find((trace) => trace.name === traceName)
        return Object.keys(selectedCohortData[traceName]).map((cohortName) => {
            return chartDataFromCohortData(selectedCohortData[traceName][cohortName], trace, cohortName)
        })
    }).flat();

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        setSelectedCohortData(changedSelectedTracesData)
    }

    return (
        <ChartContainer onMouseOver={() => setHovering(true)} onMouseOut={() => setHovering(false)}>
            <Menu hovering={hovering}>
                <MenuItem>
                    <CohortSelect tracesData={tracesData} onChange={onSelectedCohortChange} isMulti={true} />
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
