import { useEffect } from 'react'
import Select from 'react-select'

const TraceSelect = ({ onChange, traceData, isMulti, showLabel }) => {
    const id = (traceName, cohortName) => {
        return `${traceName}.${cohortName}`
    }
    const generateNewTraceData = (selectedCohorts) => {
        const newTraceData = {};
        if (!selectedCohorts) {
            return newTraceData;
        }
        if (!Array.isArray(selectedCohorts)) {
            selectedCohorts = [selectedCohorts];
        }
        const selectedCohortNames = selectedCohorts.map((selectedCohort) => selectedCohort.value)
        Object.keys(traceData).forEach((traceName) => {
            Object.keys(traceData[traceName]).forEach((cohortName) => {
                if (selectedCohortNames.includes(id(traceName, cohortName))) {
                    if (!newTraceData.hasOwnProperty(traceName)) {
                        newTraceData[traceName] = {}
                    }
                    newTraceData[traceName][cohortName] = traceData[traceName][cohortName]
                }
            })
        })
        return newTraceData;
    }

    const getOptions = () => {
        const options = [];
        Object.keys(traceData).forEach((traceName) => {
            Object.keys(traceData[traceName]).forEach((cohortName) => {
                options.push({ value: `${traceName}.${cohortName}`, label: cohortName })
            })
        })
        return options;
    }

    const onSelectChange = (values) => {
        onChange(generateNewTraceData(values))
    }
    const getDefaultValue = () => {
        return isMulti ? getOptions() : getOptions[0];
    }

    useEffect(() => {
        onChange(generateNewTraceData(getDefaultValue()))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            {showLabel && <label htmlFor='traceSelect'>Traces</label>}
            <Select inputId="traceSelect" options={getOptions()} defaultValue={getDefaultValue()} isMulti={isMulti} onChange={onSelectChange} />
        </>
    )
}

export default TraceSelect;