import React, { useState, useRef, useEffect } from 'react';
import { FaChevronDown, FaTimes } from 'react-icons/fa';
import { runDuckDBQuery } from '../../../duckdb/queries';
import { useDuckDB } from '../../../contexts/DuckDBContext';
import DropdownOptions from './DropdownOptions';
import { DropdownButton, DropdownLabel, DropdownMenu, LoadingBar, LoadingContainer, SearchInput, SelectedTag } from '../../styled/DropdownButton';

const Dropdown = ({
  label = '',
  options: rawOptions,
  isMulti = false,
  defaultValue: rawDefaultValue,
  placeholder = 'Select option...',
  name,
  setInputValue,
  setDefaultInputValue,
  isQuery = false
}) => {
  const db = useDuckDB();
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [selectedItems, setSelectedItems] = useState(isMulti ? [] : null);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const initializeDropdown = async () => {
      setLoading(true);
      let opts = [];

      if (isQuery) {
        const result = await runDuckDBQuery(db, rawOptions, 1000).catch(() => false);
        const values = result?.getChildAt(0);
        if (values) {
          opts = Array.from({ length: values.length }, (_, i) => {
            const val = values.get(i);
            return { id: val, label: val };
          });
        }
      } 
      else if (Array.isArray(rawOptions)) {
        opts = rawOptions.map(option => ({
          id: option,
          label: option,
        }));
      }

      setOptions(opts);

      if (rawDefaultValue) {
        let defVal;
        
        if (isMulti) {
          defVal = Array.isArray(rawDefaultValue) && rawDefaultValue.length > 0
            ? rawDefaultValue.map(d => ({ id: d, label: d }))
            : [];
        } else {
          defVal = { id: rawDefaultValue, label: rawDefaultValue };
        }
        
        setSelectedItems(defVal);
        
        if (setDefaultInputValue) {
          setDefaultInputValue(name, rawDefaultValue);
        }
      }

      setLoading(false);
    };

    initializeDropdown();
  }, [db, rawOptions, rawDefaultValue, isQuery, isMulti, name, setDefaultInputValue]);

  useEffect(() => {
    if (name && setInputValue && !loading) {
      if (isMulti) {
        setInputValue(name, selectedItems.map(item => item.id));
      } else {
        setInputValue(name, selectedItems?.id);
      }
    }
  }, [selectedItems, name, isMulti, setInputValue, loading]);

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
    if (isMulti) {
      setSelectedItems(prev => {
        const isSelected = prev.some(item => item.id === option.id);
        if (isSelected) {
          return prev.filter(item => item.id !== option.id);
        } else {
          return [...prev, option];
        }
      });
    } else {
      setSelectedItems(option);
      setIsOpen(false);
    }
  };

  const removeSelection = optionId => {
    if (isMulti) {
      setSelectedItems(prev => prev.filter(item => item.id !== optionId));
    } else {
      setSelectedItems(null);
    }
  };

  const clearAll = () => {
    setSelectedItems(isMulti ? [] : null);
  };

  const isSelected = option => {
    if (isMulti) {
      return selectedItems.some(item => item.id === option.id);
    } else {
      return selectedItems?.id === option.id;
    }
  };

  if (loading) {
    return (
      <div className="w-full min-w-[200px]">
        {label && <DropdownLabel>{label}</DropdownLabel>}
        <LoadingContainer>
          <LoadingBar/>
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
            {(isMulti ? selectedItems.length === 0 : !selectedItems) ? (
              <span className="text-gray-500">{placeholder}</span>
            ) : isMulti ? (
              <div className="flex flex-wrap gap-1">
                {selectedItems.slice(0, 2).map(item => (
                  <SelectedTag
                    key={item.id}
                  >
                    {item.label}
                    <button
                      aria-label={`Remove ${item.label}`}
                      onClick={e => {
                        e.stopPropagation();
                        removeSelection(item.id);
                      }}
                      className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors cursor-pointer"
                    >
                      <FaTimes className="w-3 h-3" />
                    </button>
                  </SelectedTag>
                ))}
                {selectedItems.length > 2 && (
                  <span className="text-sm text-gray-600">+{selectedItems.length - 2} more</span>
                )}
              </div>
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

            {isMulti && selectedItems.length > 0 && (
              <div className="p-2 border-b border-gray-200">
                <button
                  onClick={clearAll}
                  className="text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  Clear all selections
                </button>
              </div>
            )}

            <DropdownOptions
              options={options}
              filteredOptions={filteredOptions}
              isSelected={isSelected}
              toggleSelection={toggleSelection}
              highlightedIndex={highlightedIndex}
              isMulti={isMulti}
              selectedItems={selectedItems}
            />
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

export default Dropdown;