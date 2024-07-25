import Loading from "../Loading";
import React from "react";
import CohortSelect from "./CohortSelect";
import tw from "tailwind-styled-components"
import { useTracesData } from "../../hooks/useTracesData";

export const ChartContainer = tw.div`
    relative
`;

const Selector = ({ selector, project, itemWidth }) => {
    const traceNames = selector.options.map((trace) => trace.name)
    const tracesData = useTracesData(project.id, traceNames)

    if (!tracesData) {
        return <Loading text={selector.name} width={itemWidth} />
    }

    return (
        <div className={`grow-${itemWidth} p-2 m-auto flex`}>
            <div className="m-auto justify-center">
                <CohortSelect
                    tracesData={tracesData}
                    onChange={() => { }}
                    selector={selector}
                    parentName={selector.name}
                    parentType="chart"
                />
            </div>
        </div>
    );
}

export default Selector;
