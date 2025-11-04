import React, { useState, useRef, useEffect } from 'react';
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

const Dropdown = ({
  label = '',
  options: rawOptions,
  defaultValue: rawDefaultValue,
  placeholder = 'Select option...',
  name,
  setInputValue,
  setDefaultInputValue,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [selectedItems, setSelectedItems] = useState(null); // Single-select only
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const initializeDropdown = () => {
      setLoading(true);

      // Format pre-computed options from store
      const opts = Array.isArray(rawOptions)
        ? rawOptions.map(option => ({
            id: option,
            label: option,
          }))
        : [];

      setOptions(opts);

      // Set default value (single-select only)
      if (rawDefaultValue) {
        const defVal = { id: rawDefaultValue, label: rawDefaultValue };
        setSelectedItems(defVal);

        if (setDefaultInputValue) {
          setDefaultInputValue(name, rawDefaultValue);
        }
      }

      setLoading(false);
    };

    initializeDropdown();
  }, [rawOptions, rawDefaultValue, name, setDefaultInputValue]);

  useEffect(() => {
    if (name && setInputValue && !loading) {
      setInputValue(name, selectedItems?.id);
    }
  }, [selectedItems, name, setInputValue, loading]);

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
    setSelectedItems(option);
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
