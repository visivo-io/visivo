import Loading from "../Loading";
import Menu from "./Menu"
import Plot from 'react-plotly.js';
import React, { useState, useMemo, useRef, useImperativeHandle } from "react";
import CohortSelect from "../select/CohortSelect";
import { traceNamesInData, chartDataFromCohortData } from "../../models/Trace";
import { useTracesData } from "../../hooks/useTracesData";
import MenuItem from "../styled/MenuItem";
import { ItemContainer } from "./ItemContainer";

const Chart = React.forwardRef(({ chart, project, itemWidth, height, width }, ref) => {
    const [isLoading, setIsLoading] = useState(true);
    const plotRef = useRef(null);

    // Expose loading state through ref
    useImperativeHandle(ref, () => ({
        isLoading
    }), [isLoading]);

    const traceNames = chart.traces.map((trace) => trace.name)
    const tracesData = useTracesData(project.id, traceNames)
    const [hovering, setHovering] = useState(false)
    const [cohortSelectVisible, setCohortSelectVisible] = useState(false)

    const [selectedCohortData, setSelectedCohortData] = useState([])

    const selectedPlotData = useMemo(() => {
        return traceNamesInData(selectedCohortData).map((traceName) => {
            const trace = chart.traces.find((trace) => trace.name === traceName)
            if (!trace) {
                return []
            }
            return Object.keys(selectedCohortData[traceName]).map((cohortName) => {
                const chartData = chartDataFromCohortData(selectedCohortData[traceName][cohortName], trace, cohortName)
                return chartData
            })
        }).flat();
    }, [selectedCohortData, chart.traces]);

    if (!tracesData) {
        return <Loading text={chart.name} width={itemWidth} />
    }

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        setIsLoading(true);
        setSelectedCohortData(changedSelectedTracesData)
    }

    const layout = structuredClone(chart.layout ? chart.layout : {})

    return (
        <ItemContainer onMouseOver={() => setHovering(true)} onMouseOut={() => setHovering(false)}>
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
                layout={{ ...layout, height, width }}
                useResizeHandler={true}
                config={{ displayModeBar: false }}
                ref={plotRef}
                onAfterPlot={() => {
                    setIsLoading(false);
                }}
            />
        </ItemContainer>
    );
});

export default Chart;
