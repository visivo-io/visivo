import { useEffect, useMemo } from 'react';
import Select from 'react-select';
import useStore from '../../stores/store';
import { useUrlSync } from '../../hooks/useUrlSync';

export const getOptionsFromValues = valueArrayOrString => {
  if (!valueArrayOrString) {
    return null;
  }
  if (Array.isArray(valueArrayOrString)) {
    return valueArrayOrString.map(valueArray => {
      return { value: valueArray, label: valueArray };
    });
  } else {
    return { value: valueArrayOrString, label: valueArrayOrString };
  }
};

const getValuesFromOptions = optionArrayOrObject => {
  if (Array.isArray(optionArrayOrObject)) {
    return optionArrayOrObject.map(optionArray => optionArray.value);
  } else {
    return [optionArrayOrObject.value];
  }
};

export const generateNewSearchParam = (
  selectedOptions,
  defaultOptions,
  alwaysPushSelectionToUrl
) => {
  const selectedOptionsValues = getValuesFromOptions(selectedOptions);

  if (!alwaysPushSelectionToUrl) {
    const defaultOptionsValues = getValuesFromOptions(defaultOptions);
    if (
      selectedOptionsValues.length === defaultOptionsValues.length &&
      defaultOptionsValues.every(dov => selectedOptionsValues.includes(dov))
    ) {
      return null;
    }
  }

  if (Array.isArray(selectedOptions) && selectedOptions.length !== 0) {
    return selectedOptionsValues;
  } else if (Array.isArray(selectedOptions) && selectedOptions.length === 0) {
    return 'NoCohorts';
  } else {
    return selectedOptions.value;
  }
};

const NameSelect = ({
  names,
  showLabel,
  selector,
  parentName,
  parentType,
  onChange,
  alwaysPushSelectionToUrl = false,
  onVisible = () => {},
}) => {
  const [, setStateSearchParam] = useUrlSync();
  const generateSelectorOptions = useStore(state => state.generateSelectorOptions);
  const getSelectorValue = useStore(state => state.getSelectorValue);
  // Generate selector configuration using store helper
  const selectorConfig = generateSelectorOptions(selector, parentName, parentType, names);
  const { isMulti, name, visible, options } = selectorConfig;

  // Get current selector value from store
  const currentValue = getSelectorValue(name);

  useEffect(() => {
    onVisible(visible);
  }, [visible, onVisible]);

  const defaultOptions = useMemo(() => {
    return isMulti ? options : options[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options), isMulti]);

  const onSelectChange = selectedOptions => {
    setStateSearchParam(
      name,
      generateNewSearchParam(selectedOptions, defaultOptions, alwaysPushSelectionToUrl)
    );
  };

  // Set the default value if the selector is not set
  useEffect(() => {
    if (alwaysPushSelectionToUrl && currentValue === null) {
      const getDefaultSearchParam = () => {
        if (Array.isArray(defaultOptions)) {
          return defaultOptions.map(option => option.value).join(',');
        } else if (defaultOptions) {
          return defaultOptions.value;
        } else {
          return null;
        }
      };
      if (currentValue === null) {
        setStateSearchParam(name, getDefaultSearchParam());
      }
    }
  }, [alwaysPushSelectionToUrl, currentValue, name, defaultOptions, setStateSearchParam]);

  const selectedNames = useMemo(() => {
    if (currentValue !== null && currentValue !== undefined) {
      return currentValue;
    } else if (!defaultOptions) {
      return null;
    } else {
      return Array.isArray(defaultOptions)
        ? defaultOptions.map(ds => ds.value)
        : defaultOptions.value;
    }
  }, [currentValue, defaultOptions]);

  const selectedOptions = useMemo(() => {
    return getOptionsFromValues(selectedNames);
  }, [selectedNames]);

  useEffect(() => {
    onChange(selectedNames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(selectedNames)]);

  return (
    <>
      {showLabel && <label htmlFor={`selector${name}`}>Selector</label>}
      {visible && (
        <Select
          styles={{ menu: provided => ({ ...provided, zIndex: 9999 }) }}
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
  );
};

export default NameSelect;
