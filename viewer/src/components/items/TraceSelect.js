import Select from 'react-select'

const TraceSelect = (props) => {
    const id = (traceName, cohortName) => {
        return `${traceName}.${cohortName}`
    }
    const generateNewTraceData = (selectedCohorts) => {
        const traceData = {};
        if (!selectedCohorts) {
            return traceData;
        }
        if (!Array.isArray(selectedCohorts)) {
            selectedCohorts = [selectedCohorts];
        }
        const selectedCohortNames = selectedCohorts.map((selectedCohort) => selectedCohort.value)
        Object.keys(props.traceData).forEach((traceName) => {
            Object.keys(props.traceData[traceName]).forEach((cohortName) => {
                if (selectedCohortNames.includes(id(traceName, cohortName))) {
                    if (!traceData.hasOwnProperty(traceName)) {
                        traceData[traceName] = {}
                    }
                    traceData[traceName][cohortName] = props.traceData[traceName][cohortName]
                }
            })
        })
        return traceData;
    }

    const getOptions = () => {
        const options = [];
        Object.keys(props.traceData).forEach((traceName) => {
            Object.keys(props.traceData[traceName]).forEach((cohortName) => {
                options.push({ value: `${traceName}.${cohortName}`, label: cohortName })
            })
        })
        return options;
    }

    const onSelectChange = (values) => {
        props.onChange(generateNewTraceData(values))
    }
    return (
        <>
            {props.showLabel && <label htmlFor='traceSelect'>Traces</label>}
            <Select inputId="traceSelect" options={getOptions()} isMulti={props.isMulti} onChange={onSelectChange} />
        </>
    )
}

export default TraceSelect;