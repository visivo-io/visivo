import React, { useState, useEffect } from 'react';
import { DropdownLabel } from '../../styled/DropdownButton';

/**
 * RadioInput - Single-select input displayed as radio buttons.
 *
 * This is a display-only component - it receives selectedValue from props (store via parent)
 * and only calls setInputValue on user interaction.
 *
 * Best for: Small option sets (2-5 options) where all choices should be visible.
 */
const RadioInput = ({
  label = '',
  options: rawOptions,
  selectedValue, // Current value from store (via parent)
  name,
  setInputValue, // Only called on user interaction
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

  const handleChange = value => {
    // Only call setInputValue on user interaction
    if (setInputValue) {
      setInputValue(name, value);
    }
  };

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="flex flex-col gap-2">
        {options.map(option => (
          <label
            key={option.id}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg border cursor-pointer transition-all duration-200 ${
              selectedValue === option.id
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={selectedValue === option.id}
              onChange={() => handleChange(option.id)}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default RadioInput;
