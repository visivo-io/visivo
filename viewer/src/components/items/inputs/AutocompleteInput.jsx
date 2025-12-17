import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FaChevronDown, FaTimes } from 'react-icons/fa';
import { DropdownLabel, DropdownMenu } from '../../styled/DropdownButton';

/**
 * AutocompleteInput - Single-select input with searchable dropdown.
 *
 * This is a display-only component - it receives selectedValue from props (store via parent)
 * and only calls setInputValue on user interaction.
 *
 * Best for: Large option sets (10+ options) where users need to search/filter.
 * The search input is always visible, making it faster to find options.
 */
const AutocompleteInput = ({
  label = '',
  options: rawOptions,
  selectedValue, // Current value from store (via parent)
  placeholder = 'Search or select...',
  name,
  setInputValue, // Only called on user interaction
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Derive display text from selectedValue prop
  const displayText = useMemo(() => {
    return selectedValue || '';
  }, [selectedValue]);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter(option =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

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

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
        // Reset search term to show selected value when closing
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = e => {
    const value = e.target.value;
    setSearchTerm(value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    // Select all text on focus for easy replacement
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleKeyDown = e => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      setIsOpen(true);
      return;
    }

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        setSearchTerm('');
        inputRef.current?.blur();
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
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          selectOption(filteredOptions[highlightedIndex]);
        } else if (filteredOptions.length === 1) {
          // Auto-select if only one match
          selectOption(filteredOptions[0]);
        }
        break;
      case 'Tab':
        // Allow natural tab behavior but close dropdown
        setIsOpen(false);
        setSearchTerm('');
        break;
      default:
        break;
    }
  };

  const selectOption = option => {
    if (setInputValue && name) {
      setInputValue(name, option.id);
    }
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const clearSelection = e => {
    e.stopPropagation();
    if (setInputValue && name) {
      setInputValue(name, null);
    }
    setSearchTerm('');
    inputRef.current?.focus();
  };

  // Highlight matching text in option labels
  const highlightMatch = text => {
    if (!searchTerm) return text;

    const lowerText = text.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    const index = lowerText.indexOf(lowerSearch);

    if (index === -1) return text;

    return (
      <>
        {text.substring(0, index)}
        <span className="bg-yellow-200 font-medium">{text.substring(index, index + searchTerm.length)}</span>
        {text.substring(index + searchTerm.length)}
      </>
    );
  };

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="relative" ref={dropdownRef}>
        {/* Input field with dropdown button */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={isOpen ? searchTerm : displayText}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-4 py-2 pr-16 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {selectedValue && (
              <button
                type="button"
                onClick={clearSelection}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Clear selection"
              >
                <FaTimes className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsOpen(!isOpen);
                if (!isOpen) {
                  inputRef.current?.focus();
                }
              }}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Toggle dropdown"
            >
              <FaChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Dropdown menu */}
        {isOpen && (
          <DropdownMenu>
            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-sm text-gray-500 text-center">
                  {searchTerm ? 'No matching options' : 'No options available'}
                </div>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = selectedValue === option.id;
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectOption(option)}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer ${
                        isHighlighted ? 'bg-blue-100 text-blue-700' : ''
                      } ${isSelected ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-900 hover:bg-gray-100'}`}
                    >
                      {highlightMatch(option.label)}
                    </button>
                  );
                })
              )}
            </div>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

export default AutocompleteInput;
