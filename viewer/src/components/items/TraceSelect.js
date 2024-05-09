import { useEffect } from 'react'
import Select from 'react-select'

const TraceSelect = ({ onChange, plotData, isMulti, showLabel }) => {
    const generateNewTraceData = (selectedCohorts) => {
        const newTraceData = [];
        if (!selectedCohorts) {
            return newTraceData;
        }
        if (!Array.isArray(selectedCohorts)) {
            selectedCohorts = [selectedCohorts];
        }
        const selectedCohortNames = selectedCohorts.map((selectedCohort) => selectedCohort.value)
        plotData.forEach((traceDatum) => {
            if (selectedCohortNames.includes(traceDatum.name)) {
                newTraceData.push(traceDatum)
            }
        })
        return newTraceData;
    }

    const getOptions = () => {
        const options = [];
        plotData.forEach((traceDatum) => {
            options.push({ value: traceDatum.name, label: traceDatum.name })
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