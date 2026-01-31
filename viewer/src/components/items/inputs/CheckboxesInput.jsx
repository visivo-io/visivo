import React, { useState, useEffect, useMemo } from 'react';
import { FaCheck } from 'react-icons/fa';
import { DropdownLabel } from '../../styled/DropdownButton';

/**
 * CheckboxesInput - Multi-select input displayed as checkboxes.
 *
 * This is a display-only component - it receives selectedValues from props (store via parent)
 * and only calls setInputJobValue on user interaction.
 *
 * Best for: Small to medium option sets (2-10 options) where multiple
 * selections are needed and all options should be visible.
 */
const CheckboxesInput = ({
  label = '',
  options: rawOptions,
  selectedValues: propSelectedValues, // Current values from store (via parent)
  name,
  setInputJobValue, // Only called on user interaction
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

    // Only call setInputJobValue on user interaction
    if (setInputJobValue) {
      setInputJobValue(name, newValues);
    }
  };

  const handleSelectAll = () => {
    let newValues;
    if (selectedValues.length === options.length) {
      newValues = [];
    } else {
      newValues = options.map(o => o.id);
    }

    if (setInputJobValue) {
      setInputJobValue(name, newValues);
    }
  };

  const allSelected = selectedValues.length === options.length;
  const someSelected = selectedValues.length > 0 && selectedValues.length < options.length;

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="border border-gray-300 rounded-lg bg-white">
        {/* Select All option */}
        <label className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 cursor-pointer hover:bg-gray-50">
          <div
            onClick={handleSelectAll}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
              allSelected
                ? 'bg-blue-600 border-blue-600'
                : someSelected
                  ? 'bg-blue-200 border-blue-400'
                  : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {(allSelected || someSelected) && <FaCheck className="w-3 h-3 text-white" />}
          </div>
          <span className="text-sm font-medium text-gray-700">
            {allSelected ? 'Deselect All' : 'Select All'}
          </span>
          <span className="ml-auto text-xs text-gray-500">
            {selectedValues.length} of {options.length}
          </span>
        </label>

        {/* Options */}
        <div className="max-h-64 overflow-y-auto">
          {options.map(option => {
            const isSelected = selectedValues.includes(option.id);
            return (
              <label
                key={option.id}
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                  isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div
                  onClick={() => handleToggle(option.id)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {isSelected && <FaCheck className="w-3 h-3 text-white" />}
                </div>
                <span
                  className={`text-sm ${isSelected ? 'font-medium text-blue-700' : 'text-gray-900'}`}
                >
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CheckboxesInput;
