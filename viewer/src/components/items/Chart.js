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

const Chart = ({ chart, project, itemWidth, height, width }) => {
    const traceNames = chart.traces.map((trace) => trace.name)
    const tracesData = useTracesData(project.id, traceNames)
    const [hovering, setHovering] = useState(false)
    const [cohortSelectVisible, setCohortSelectVisible] = useState(false)

    const [selectedCohortData, setSelectedCohortData] = useState([])

    if (!tracesData) {
        return <Loading text={chart.name} width={itemWidth} />
    }

    const selectedPlotData = traceNamesInData(selectedCohortData).map((traceName) => {
        const trace = chart.traces.find((trace) => trace.name === traceName)
        return Object.keys(selectedCohortData[traceName]).map((cohortName) => {
            return chartDataFromCohortData(selectedCohortData[traceName][cohortName], trace, cohortName)
        })
    }).flat();

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        setSelectedCohortData(changedSelectedTracesData)
    }

    return (
        <ChartContainer onMouseOver={() => setHovering(true)} onMouseOut={() => setHovering(false)}>
            <Menu hovering={hovering && cohortSelectVisible}>
                <MenuItem>
                    <CohortSelect
                        tracesData={tracesData}
                        onChange={onSelectedCohortChange}
                        selector={chart.selector}
                        parentName={chart.name}
                        parentType="chart"
                        onVisible={(visible) => setCohortSelectVisible(visible)}
                    />
                </MenuItem>
            </Menu>
            <Plot
                key={`chart_${chart.name}`}
                data-testid={`chart_${chart.name}`}
                data={selectedPlotData}
                layout={{ ...chart.layout, height, width }}
                useResizeHandler={true}
                config={{ displayModeBar: false }}
            />
        </ChartContainer>
    );
}

export default Chart;
