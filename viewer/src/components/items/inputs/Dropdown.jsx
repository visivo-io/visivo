import React, { useState, useRef, useEffect } from 'react';
import { FaCheck, FaChevronDown, FaTimes } from 'react-icons/fa';
import useStore from '../../../stores/store';

const Dropdown = ({
  label = '',
  options = [],
  isMulti = false,
  defaultValue = null,
  placeholder = 'Select option...',
  name
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState(isMulti ? defaultValue || [] : defaultValue);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const setInputValue = useStore(state => state.setInputValue)
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      setInputValue(name, selectedItems)
    } else {
      setSelectedItems(option);
      setInputValue(name, option)
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

  return (
    <div className="w-full min-w-[200px]">
      {label && <h2 className="text-md text-center font-bold mb-2 text-gray-800">{label}</h2>}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setTimeout(() => searchInputRef.current?.focus(), 0);
            }
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left shadow-sm hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 flex items-center justify-between cursor-pointer"
        >
          <div className="flex-1 min-w-0">
            {(isMulti ? selectedItems.length === 0 : !selectedItems) ? (
              <span className="text-gray-500">{placeholder}</span>
            ) : isMulti ? (
              <div className="flex flex-wrap gap-1">
                {selectedItems.slice(0, 2).map(item => (
                  <span
                    key={item.id}
                    className="inline-flex items-center bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full"
                  >
                    {item.label}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        removeSelection(item.id);
                      }}
                      className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors cursor-pointer"
                    >
                      <FaTimes className="w-3 h-3" />
                    </button>
                  </span>
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
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg">
            {/* Search Input */}
            <div className="p-3 border-b border-gray-200">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search options..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between transition-colors cursor-pointer ${
                        isHighlighted ? 'bg-blue-50 text-blue-700' : ''
                      } ${selected ? 'bg-blue-50' : ''}`}
                    >
                      <span
                        className={`truncate ${selected ? 'font-medium text-blue-700' : 'text-gray-900'}`}
                      >
                        {option.label}
                      </span>
                      {selected && <FaCheck className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {isMulti && (
              <div className="p-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 text-center">
                {selectedItems.length} of {options.length} selected
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dropdown;
