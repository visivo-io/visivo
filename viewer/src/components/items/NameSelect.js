import { useEffect, useMemo } from 'react'
import Select from 'react-select'
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


export const generateNewSearchParams = (previousSearchParams, name, selectedOptions, defaultOptions, alwaysPushSelectionToUrl) => {
    const newSearchParams = new URLSearchParams(previousSearchParams.toString())
    if (newSearchParams.has(name)) {
        newSearchParams.delete(name)
    }
    const selectedOptionsValues = getValuesFromOptions(selectedOptions)

    if (!alwaysPushSelectionToUrl) {
        const defaultOptionsValues = getValuesFromOptions(defaultOptions)
        if (selectedOptionsValues.length === defaultOptionsValues.length
            && defaultOptionsValues.every(dov => selectedOptionsValues.includes(dov))) {
            return newSearchParams
        }
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
    let [searchParams, setSearchParams] = useSearchParams();
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
        setSearchParams((previousSearchParams) => {
            return generateNewSearchParams(previousSearchParams, name, selectedOptions, defaultOptions, alwaysPushSelectionToUrl)
        })
    }

    // Set the default value if the selector is not in the url
    useEffect(() => {
        if (alwaysPushSelectionToUrl) {
            setSearchParams((previousSearchParams) => {
                const newSearchParams = new URLSearchParams(previousSearchParams);
                if (!newSearchParams.has(name)) {
                    if (Array.isArray(defaultOptions)) {
                        newSearchParams.set(name, defaultOptions.map(option => option.value).join(','));
                    } else if (defaultOptions) {
                        newSearchParams.set(name, defaultOptions.value);
                    }
                }
                return newSearchParams;
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedNames = useMemo(() => {
        if (searchParams.has(name)) {
            return searchParams.get(name).split(",")
        } else if (!defaultOptions) {
            return ""
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
