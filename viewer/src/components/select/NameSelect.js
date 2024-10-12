import { useEffect, useMemo, useContext } from 'react'
import Select from 'react-select'
import SearchParamsContext from '../../contexts/SearchParamsContext'

export const getOptionsFromValues = (valueArrayOrString) => {
    if (!valueArrayOrString) {
        return null
    }
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

export const generateNewSearchParam = (selectedOptions, defaultOptions, alwaysPushSelectionToUrl) => {
    const selectedOptionsValues = getValuesFromOptions(selectedOptions)

    if (!alwaysPushSelectionToUrl) {
        const defaultOptionsValues = getValuesFromOptions(defaultOptions)
        if (selectedOptionsValues.length === defaultOptionsValues.length
            && defaultOptionsValues.every(dov => selectedOptionsValues.includes(dov))) {
            return null
        }
    }

    if (Array.isArray(selectedOptions) && selectedOptions.length !== 0) {
        return selectedOptionsValues
    } else if (Array.isArray(selectedOptions) && selectedOptions.length === 0) {
        return "NoCohorts"
    } else {
        return selectedOptions.value
    }
}

const NameSelect = ({
    names,
    showLabel,
    selector,
    parentName,
    parentType,
    onChange,
    alwaysPushSelectionToUrl = false,
    onVisible = () => { }
}) => {
    const [searchParams, setStateSearchParam] = useContext(SearchParamsContext);
    let isMulti
    let name
    let visible
    if (selector) {
        isMulti = selector.type === "multiple"
        name = selector.name
        visible = selector.parent_name === parentName
    } else {
        isMulti = parentType === "table" ? false : true
        name = `${parentName} Selector`
        visible = true
    }

    useEffect(() => {
        onVisible(visible)
    }, [visible, onVisible]);

    const options = names.map((name) => { return { value: name, label: name } });

    const defaultOptions = useMemo(() => {
        return isMulti ? options : options[0];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(options), isMulti])

    const onSelectChange = (selectedOptions) => {
        setStateSearchParam(name, generateNewSearchParam(selectedOptions, defaultOptions, alwaysPushSelectionToUrl))
    }

    // Set the default value if the selector is not in the url
    useEffect(() => {
        if (alwaysPushSelectionToUrl) {
            const getDefaultSearchParam = () => {
                if (Array.isArray(defaultOptions)) {
                    return defaultOptions.map(option => option.value).join(',');
                } else if (defaultOptions) {
                    return defaultOptions.value;
                } else {
                    return null
                }
            }
            if (!searchParams.has(name)) {
                setStateSearchParam(name, getDefaultSearchParam())
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams.toString(), JSON.stringify(defaultOptions)]);

    const selectedNames = useMemo(() => {
        if (searchParams.has(name) && searchParams.get(name).includes("NoCohorts")) {
            return null
        } else if (searchParams.has(name)) {
            return searchParams.get(name).split(",")
        } else if (!defaultOptions) {
            return null
        } else {
            return Array.isArray(defaultOptions) ? defaultOptions.map((ds) => ds.value) : defaultOptions.value
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, selector, JSON.stringify(defaultOptions)])


    const selectedOptions = useMemo(() => {
        return getOptionsFromValues(selectedNames);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(selectedNames)]);

    useEffect(() => {
        onChange(selectedNames)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(selectedNames)]);

    return (
        <>
            {showLabel && <label htmlFor={`selector${name}`}>Selector</label>}
            {visible && (
                <Select
                    data-testid="selector"
                    name="selector"
                    inputId={`selector${name}`}
                    options={options}
                    value={selectedOptions}
                    isMulti={isMulti}
                    onChange={onSelectChange}
                />
            )}
        </>
    )
}

export default NameSelect;
