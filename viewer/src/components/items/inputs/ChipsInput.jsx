import React, { useState, useEffect, useMemo } from 'react';
import { FaTimes } from 'react-icons/fa';
import { DropdownLabel } from '../../styled/DropdownButton';

/**
 * ChipsInput - Multi-select input displayed as clickable chips/tags.
 *
 * This is a display-only component - it receives selectedValues from props (store via parent)
 * and only calls setInputValue on user interaction.
 *
 * Best for: Medium option sets (3-15 options) where a compact, visual
 * representation of selections is preferred.
 */
const ChipsInput = ({
  label = '',
  options: rawOptions,
  selectedValues: propSelectedValues, // Current values from store (via parent)
  name,
  setInputValue, // Only called on user interaction
}) => {
  const [options, setOptions] = useState([]);

  // Convert propSelectedValues to array for internal use
  const selectedValues = useMemo(() => {
    if (!propSelectedValues) return [];
    return Array.isArray(propSelectedValues) ? propSelectedValues : [propSelectedValues];
  }, [propSelectedValues]);

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

  const handleToggle = value => {
    let newValues;
    if (selectedValues.includes(value)) {
      newValues = selectedValues.filter(v => v !== value);
    } else {
      newValues = [...selectedValues, value];
    }

    // Only call setInputValue on user interaction
    if (setInputValue) {
      setInputValue(name, newValues);
    }
  };

  const handleClearAll = () => {
    if (setInputValue) {
      setInputValue(name, []);
    }
  };

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const isSelected = selectedValues.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleToggle(option.id)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                isSelected
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
              }`}
            >
              {option.label}
              {isSelected && <FaTimes className="w-3 h-3 ml-1" />}
            </button>
          );
        })}
      </div>
      {selectedValues.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          {selectedValues.length} selected
          <button
            type="button"
            onClick={handleClearAll}
            className="ml-2 text-blue-600 hover:text-blue-800"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};

export default ChipsInput;
