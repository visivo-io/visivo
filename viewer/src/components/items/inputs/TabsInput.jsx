import React, { useState, useEffect } from 'react';
import { DropdownLabel } from '../../styled/DropdownButton';

/**
 * TabsInput - Single-select input displayed as segmented tabs.
 *
 * This is a display-only component - it receives selectedValue from props (store via parent)
 * and only calls setInputJobValue on user interaction.
 *
 * Best for: Small to medium option sets (2-6 options) where a horizontal
 * button group is preferred over a dropdown.
 */
const TabsInput = ({
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

  const handleSelect = value => {
    // Only call setInputJobValue on user interaction
    if (setInputJobValue) {
      setInputJobValue(name, value);
    }
  };

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-1">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleSelect(option.id)}
            className={`px-4 py-2 text-sm font-medium transition-all duration-200 ${
              index === 0 ? 'rounded-l-md' : ''
            } ${index === options.length - 1 ? 'rounded-r-md' : ''} ${
              selectedValue === option.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TabsInput;
