import { useEffect, useMemo } from 'react'
import Select from 'react-select'
import { cohortNamesInData } from '../../models/Trace';
import { useSearchParams } from "react-router-dom";

const getOptionsFromValues = (valueArrayOrString) => {
    if (Array.isArray(valueArrayOrString)) {
        return valueArrayOrString.map((valueArray) => {
            return { value: valueArray, label: valueArray }
        })
    } else {
        return { value: valueArrayOrString, label: valueArrayOrString }
    }
}

const getValuesFromOptions = (optionArrayOrObject) => {
    if (Array.isArray(optionArrayOrObject)) {
        return optionArrayOrObject.map((optionArray) => optionArray.value)
    } else {
        return [optionArrayOrObject.value]
    }
}

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

export const generateNewSearchParams = (previousSearchParams, name, selectedOptions, defaultOptions) => {
    const newSearchParams = new URLSearchParams(previousSearchParams.toString())
    if (newSearchParams.has(name)) {
        newSearchParams.delete(name)
    }
    const selectedOptionsValues = getValuesFromOptions(selectedOptions)
    const defaultOptionsValues = getValuesFromOptions(defaultOptions)
    if (selectedOptionsValues.length === defaultOptionsValues.length
        && defaultOptionsValues.every(dov => selectedOptionsValues.includes(dov))) {
        return newSearchParams
    }

    if (Array.isArray(selectedOptions) && selectedOptions.length !== 0) {
        newSearchParams.append(name, selectedOptionsValues)
    } else if (Array.isArray(selectedOptions) && selectedOptions.length === 0) {
        newSearchParams.append(name, "NoCohorts")
    } else {
        newSearchParams.append(name, selectedOptions.value)
    }
    return newSearchParams
}

const TraceSelect = ({ onChange, tracesData, isMulti, showLabel, name }) => {
    let [searchParams, setSearchParams] = useSearchParams();

    const options = cohortNamesInData(tracesData).map((cohortName) => {
        return { value: cohortName, label: cohortName }
    });

    const defaultOptions = useMemo(() => {
        return isMulti ? options : options[0];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(options), isMulti])


    const onSelectChange = (selectedOptions) => {
        setSearchParams((previousSearchParams) => {
            return generateNewSearchParams(previousSearchParams, name, selectedOptions, defaultOptions)
        })
    }

    const selectedCohortNames = useMemo(() => {
        if (searchParams.has(name)) {
            return searchParams.getAll(name)
        } else {
            return Array.isArray(defaultOptions) ? defaultOptions.map((ds) => ds.value) : defaultOptions.value
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, name, JSON.stringify(defaultOptions)])

    useEffect(() => {
        onChange(generateNewTraceDataFromSelection(tracesData, selectedCohortNames))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(selectedCohortNames)]);

    return (
        <>
            {showLabel && <label htmlFor='traceSelect'>Traces</label>}
            <Select name="traceSelect" inputId="traceSelect" options={options} defaultValue={getOptionsFromValues(selectedCohortNames)} isMulti={isMulti} onChange={onSelectChange} />
        </>
    )
}

export default TraceSelect;