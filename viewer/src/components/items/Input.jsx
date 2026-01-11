import React, { useCallback, useMemo } from 'react';
import useStore from '../../stores/store';
import { useInputOptions } from '../../hooks/useInputOptions';

// Input display components
import Dropdown from './inputs/Dropdown';
import MultiSelectDropdown from './inputs/MultiSelectDropdown';
import RadioInput from './inputs/RadioInput';
import ToggleInput from './inputs/ToggleInput';
import TabsInput from './inputs/TabsInput';
import CheckboxesInput from './inputs/CheckboxesInput';
import ChipsInput from './inputs/ChipsInput';
import RangeSliderInput from './inputs/RangeSliderInput';
import AutocompleteInput from './inputs/AutocompleteInput';
import SliderInput from './inputs/SliderInput';
import DateRangeInput from './inputs/DateRangeInput';

// Input type constants
export const SINGLE_SELECT = 'single-select';
export const MULTI_SELECT = 'multi-select';

/**
 * Input component that renders the appropriate display component
 * based on input type and display.type configuration.
 *
 * Default values are set by the useInputOptions hook (which loads from JSON).
 * This component reads the current value from the store and passes it to the display component.
 * Display components only call setInputValue when the user actively selects a new option.
 */
const Input = ({ input, itemWidth, project }) => {
  const setInputValue = useStore(state => state.setInputValue);
  // Performance optimization: Only subscribe to THIS input's value, not all inputs
  // This prevents re-rendering when other inputs change
  const mySelectedValue = useStore(
    useCallback(state => state.inputSelectedValues?.[input?.name], [input?.name])
  );

  // Load options from JSON (this also sets defaults via setDefaultInputValue)
  const options = useInputOptions(input, project?.id);

  // Determine input type and multi-select status
  const inputType = input?.type;
  const isMulti = inputType === MULTI_SELECT;
  const displayType = input?.display?.type || 'dropdown';

  // Memoized wrapper for setInputValue that passes the input type
  const handleSetInputValue = useCallback(
    (name, value) => {
      setInputValue(name, value, isMulti ? MULTI_SELECT : SINGLE_SELECT);
    },
    [setInputValue, isMulti]
  );

  // Get current selected value(s) from store (for display)
  // Uses mySelectedValue (raw value for THIS input only)
  const { selectedValue, selectedValues } = useMemo(() => {
    if (mySelectedValue === undefined || mySelectedValue === null) {
      return { selectedValue: null, selectedValues: null };
    }

    if (isMulti) {
      // For multi-select, ensure we have an array
      const valuesArray = Array.isArray(mySelectedValue) ? mySelectedValue : [mySelectedValue];
      return {
        selectedValue: valuesArray[0] || null,
        selectedValues: valuesArray,
      };
    } else {
      // For single-select, return value directly
      return {
        selectedValue: mySelectedValue,
        selectedValues: null,
      };
    }
  }, [mySelectedValue, isMulti]);

  // Early return checks (after all hooks)
  if (!input) return null;

  // Only render for valid input types
  const shouldRender = inputType === SINGLE_SELECT || inputType === MULTI_SELECT;
  if (!shouldRender) return null;

  // Common props for all display components
  const commonProps = {
    label: input?.label,
    options,
    name: input.name,
    setInputValue: handleSetInputValue,
  };

  // Render the appropriate display component based on type and display config
  const renderDisplayComponent = () => {
    if (isMulti) {
      // Multi-select display types
      switch (displayType) {
        case 'checkboxes':
          return <CheckboxesInput {...commonProps} selectedValues={selectedValues} />;
        case 'chips':
        case 'tags':
          return <ChipsInput {...commonProps} selectedValues={selectedValues} />;
        case 'range-slider':
          return <RangeSliderInput {...commonProps} selectedValues={selectedValues} />;
        case 'date-range':
          return <DateRangeInput {...commonProps} selectedValues={selectedValues} />;
        case 'dropdown':
        default:
          return <MultiSelectDropdown {...commonProps} selectedValues={selectedValues} />;
      }
    } else {
      // Single-select display types
      switch (displayType) {
        case 'radio':
          return <RadioInput {...commonProps} selectedValue={selectedValue} />;
        case 'toggle':
          return <ToggleInput {...commonProps} selectedValue={selectedValue} />;
        case 'tabs':
          return <TabsInput {...commonProps} selectedValue={selectedValue} />;
        case 'autocomplete':
          return <AutocompleteInput {...commonProps} selectedValue={selectedValue} />;
        case 'slider':
          return <SliderInput {...commonProps} selectedValue={selectedValue} />;
        case 'dropdown':
        default:
          return <Dropdown {...commonProps} selectedValue={selectedValue} />;
      }
    }
  };

  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">{renderDisplayComponent()}</div>
    </div>
  );
};

export default Input;
