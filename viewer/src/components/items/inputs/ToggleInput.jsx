import React, { useState, useEffect, useMemo } from 'react';
import { DropdownLabel } from '../../styled/DropdownButton';

/**
 * ToggleInput - Single-select input displayed as a toggle switch.
 *
 * This is a display-only component - it receives selectedValue from props (store via parent)
 * and only calls setInputJobValue on user interaction.
 *
 * Best for: Binary choices (exactly 2 options) like on/off, yes/no, enabled/disabled.
 * The first option is shown when toggle is OFF (left), second when ON (right).
 */
const ToggleInput = ({
  label = '',
  options: rawOptions,
  selectedValue, // Current value from store (via parent)
  name,
  setInputJobValue, // Only called on user interaction
}) => {
  const [options, setOptions] = useState([]);

  // Convert raw options to formatted options
  useEffect(() => {
    const opts = Array.isArray(rawOptions)
      ? rawOptions.map(option => ({
          id: option,
          label: String(option),
        }))
      : [];
    setOptions(opts);
  }, [rawOptions]);

  // Derive toggle state from selectedValue
  const isOn = useMemo(() => {
    if (options.length >= 2 && selectedValue !== undefined && selectedValue !== null) {
      return selectedValue === options[1].id;
    }
    return false;
  }, [selectedValue, options]);

  const handleToggle = () => {
    if (options.length < 2) return;

    const newValue = isOn ? options[0].id : options[1].id;

    // Only call setInputJobValue on user interaction
    if (setInputJobValue) {
      setInputJobValue(name, newValue);
    }
  };

  if (options.length < 2) {
    return (
      <div className="w-full min-w-[200px]">
        {label && <DropdownLabel>{label}</DropdownLabel>}
        <div className="text-red-500 text-sm">Toggle requires exactly 2 options</div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="flex items-center justify-center gap-3">
        <span
          className={`text-sm font-medium transition-colors ${
            !isOn ? 'text-blue-700' : 'text-gray-500'
          }`}
        >
          {options[0].label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            isOn ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
              isOn ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${
            isOn ? 'text-blue-700' : 'text-gray-500'
          }`}
        >
          {options[1].label}
        </span>
      </div>
    </div>
  );
};

export default ToggleInput;
