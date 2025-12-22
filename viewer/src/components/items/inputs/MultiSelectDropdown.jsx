import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FaChevronDown, FaTimes, FaCheck } from 'react-icons/fa';
import {
  DropdownButton,
  DropdownLabel,
  DropdownMenu,
  SearchInput,
} from '../../styled/DropdownButton';

/**
 * MultiSelectDropdown - Multi-select input displayed as a dropdown with checkboxes.
 *
 * This is a display-only component - it receives selectedValues from props (store via parent)
 * and only calls setInputValue on user interaction.
 *
 * Best for: Medium to large option sets where multiple selections are needed
 * and a compact UI is preferred over showing all options.
 */
const MultiSelectDropdown = ({
  label = '',
  options: rawOptions,
  selectedValues: propSelectedValues, // Current values from store (via parent)
  placeholder = 'Select options...',
  name,
  setInputValue, // Only called on user interaction
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Convert propSelectedValues to internal format for display
  const selectedItems = useMemo(() => {
    if (!propSelectedValues) return [];
    const values = Array.isArray(propSelectedValues) ? propSelectedValues : [propSelectedValues];
    return values.map(v => ({ id: v, label: String(v) }));
  }, [propSelectedValues]);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = e => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0) {
          toggleSelection(filteredOptions[highlightedIndex]);
        }
        break;
      default:
        break;
    }
  };

  const toggleSelection = option => {
    const currentValues = selectedItems.map(item => item.id);
    const isSelected = currentValues.includes(option.id);

    let newValues;
    if (isSelected) {
      newValues = currentValues.filter(v => v !== option.id);
    } else {
      newValues = [...currentValues, option.id];
    }

    // Only call setInputValue on user interaction
    if (setInputValue) {
      setInputValue(name, newValues);
    }
  };

  const removeItem = (e, option) => {
    e.stopPropagation();
    const currentValues = selectedItems.map(item => item.id);
    const newValues = currentValues.filter(v => v !== option.id);

    if (setInputValue) {
      setInputValue(name, newValues);
    }
  };

  const isSelected = option => {
    return selectedItems.some(item => item.id === option.id);
  };

  const selectAll = () => {
    const allValues = options.map(o => o.id);
    if (setInputValue) {
      setInputValue(name, allValues);
    }
  };

  const clearAll = () => {
    if (setInputValue) {
      setInputValue(name, []);
    }
  };

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="relative" ref={dropdownRef}>
        <DropdownButton
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setTimeout(() => searchInputRef.current?.focus(), 0);
            }
          }}
          onKeyDown={handleKeyDown}
        >
          <div className="flex-1 min-w-0">
            {selectedItems.length === 0 ? (
              <span className="text-gray-500">{placeholder}</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {selectedItems.slice(0, 3).map(item => (
                  <span
                    key={item.id}
                    className="inline-flex items-center bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {item.label}
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={e => removeItem(e, item)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          removeItem(e, item);
                        }
                      }}
                      className="ml-1 hover:text-blue-600 cursor-pointer"
                    >
                      <FaTimes className="w-2 h-2" />
                    </span>
                  </span>
                ))}
                {selectedItems.length > 3 && (
                  <span className="text-xs text-gray-500 py-0.5">
                    +{selectedItems.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
          <FaChevronDown
            className={`w-2 h-2 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
              isOpen ? 'transform rotate-180' : ''
            }`}
          />
        </DropdownButton>

        {isOpen && (
          <DropdownMenu>
            <div className="p-3 border-b border-gray-200">
              <SearchInput
                ref={searchInputRef}
                type="text"
                placeholder="Search options..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
              />
            </div>

            {/* Select/Clear All buttons */}
            <div className="flex justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                Clear All
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-sm text-gray-500 text-center">No options found</div>
              ) : (
                filteredOptions.map((option, index) => {
                  const selected = isSelected(option);
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleSelection(option)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-3 transition-colors cursor-pointer ${
                        isHighlighted ? 'bg-blue-50 text-blue-700' : ''
                      } ${selected ? 'bg-blue-50' : ''}`}
                    >
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          selected
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {selected && <FaCheck className="w-2 h-2 text-white" />}
                      </div>
                      <span
                        className={`truncate ${selected ? 'font-medium text-blue-700' : 'text-gray-900'}`}
                      >
                        {option.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 text-center">
              {selectedItems.length} of {options.length} selected
            </div>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

export default MultiSelectDropdown;
