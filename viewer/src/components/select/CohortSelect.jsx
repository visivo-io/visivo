import { cohortNamesInData } from '../../models/Trace';
import NameSelect from './NameSelect';


export const generateNewTraceDataFromSelection = (tracesData, selectedCohortNames) => {
    const newTraceData = {};
    if (!selectedCohortNames) {
        return newTraceData;
    }
    Object.keys(tracesData).forEach((traceName) => {
        Object.keys(tracesData[traceName]).forEach((cohortName) => {
            if (selectedCohortNames === cohortName || selectedCohortNames.includes(cohortName)) {
                if (!newTraceData[traceName]) {
                    newTraceData[traceName] = {}
                }
                newTraceData[traceName][cohortName] = tracesData[traceName][cohortName];
            }
        })
    })
    return newTraceData
}


const CohortSelect = ({
    onChange,
    tracesData,
    showLabel,
    selector,
    parentName,
    parentType,
    alwaysPushSelectionToUrl = false,
    onVisible = () => { }
}) => {

    const onNameSelectChange = (selectedNames) => {
        onChange(generateNewTraceDataFromSelection(tracesData, selectedNames))
    }

    return (
        <>
            <NameSelect
                names={cohortNamesInData(tracesData)}
                selector={selector}
                parentName={parentName}
                parentType={parentType}
                onChange={onNameSelectChange}
                alwaysPushSelectionToUrl={alwaysPushSelectionToUrl}
                onVisible={onVisible}
                showLabel={showLabel}
            />
        </>
    )
}

export default CohortSelect;
