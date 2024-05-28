import { useEffect } from 'react'
import Select from 'react-select'
import { cohortNamesInData } from '../../models/Trace';


const TraceSelect = ({ onChange, tracesData, isMulti, showLabel }) => {
    const generateNewTraceData = (selectedCohorts) => {
        const newTraceData = {};
        if (!selectedCohorts) {
            return newTraceData;
        }
        if (!Array.isArray(selectedCohorts)) {
            selectedCohorts = [selectedCohorts];
        }
        const selectedCohortNames = selectedCohorts.map((selectedCohort) => selectedCohort.value)
        Object.keys(tracesData).forEach((traceName) => {
            Object.keys(tracesData[traceName]).forEach((cohortName) => {
                if (selectedCohortNames.includes(cohortName)) {
                    if (!newTraceData[traceName]) {
                        newTraceData[traceName] = {}
                    }
                    newTraceData[traceName][cohortName] = tracesData[traceName][cohortName];
                }
            })
        })
        return newTraceData;
    }

    const options = cohortNamesInData(tracesData).map((cohortName) => {
        return { value: cohortName, label: cohortName }
    });

    const onSelectChange = (values) => {
        onChange(generateNewTraceData(values))
    }
    const getDefaultValue = () => {
        return isMulti ? options : options[0];
    }

    useEffect(() => {
        onChange(generateNewTraceData(getDefaultValue()))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            {showLabel && <label htmlFor='traceSelect'>Traces</label>}
            <Select inputId="traceSelect" options={options} defaultValue={getDefaultValue()} isMulti={isMulti} onChange={onSelectChange} />
        </>
    )
}

export default TraceSelect;