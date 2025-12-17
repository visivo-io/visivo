import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import DropdownOptions from './DropdownOptions';
import {
  DropdownButton,
  DropdownLabel,
  DropdownMenu,
  LoadingBar,
  LoadingContainer,
  SearchInput,
} from '../../styled/DropdownButton';

/**
 * Dropdown component for single-select inputs.
 *
 * This component is DISPLAY ONLY for the current selection.
 * It does NOT set default values - that is handled by useInputOptions hook.
 * It ONLY calls setInputValue when the user actively selects a new option.
 *
 * @param {string} label - Label to display above the dropdown
 * @param {Array} options - Array of option strings
 * @param {string} selectedValue - Current selected value from store (for display)
 * @param {string} placeholder - Placeholder text when nothing selected
 * @param {string} name - Input name for store updates
 * @param {function} setInputValue - Callback for user selection changes ONLY
 */
const Dropdown = ({
  label = '',
  options: rawOptions,
  selectedValue,
  placeholder = 'Select option...',
  name,
  setInputValue,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Derive selectedItems from selectedValue prop (display only)
  const selectedItems = useMemo(() => {
    if (selectedValue) {
      return { id: selectedValue, label: selectedValue };
    }
    return null;
  }, [selectedValue]);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Initialize options when rawOptions change
  useEffect(() => {
    setLoading(true);

    // Format pre-computed options from store
    const opts = Array.isArray(rawOptions)
      ? rawOptions.map(option => ({
          id: option,
          label: option,
        }))
      : [];

    setOptions(opts);
    setLoading(false);
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
    // User actively selected an option - notify store
    if (setInputValue && name) {
      setInputValue(name, option.id);
    }
    setIsOpen(false);
  };

  const isSelected = option => {
    return selectedItems?.id === option.id;
  };

  if (loading) {
    return (
      <div className="w-full min-w-[200px]">
        {label && <DropdownLabel>{label}</DropdownLabel>}
        <LoadingContainer>
          <LoadingBar />
        </LoadingContainer>
      </div>
    );
  }

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
            {!selectedItems ? (
              <span className="text-gray-500">{placeholder}</span>
            ) : (
              <span className="text-gray-900 truncate">{selectedItems.label}</span>
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

            <DropdownOptions
              options={options}
              filteredOptions={filteredOptions}
              isSelected={isSelected}
              toggleSelection={toggleSelection}
              highlightedIndex={highlightedIndex}
              isMulti={false}
              selectedItems={selectedItems}
            />
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

export default Dropdown;
