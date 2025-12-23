import React, { useState, useRef, useEffect } from 'react';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { OBJECT_TYPES, DEFAULT_COLORS } from './objectTypeConfigs';

/**
 * ObjectTypeFilter - Dropdown multiselect for filtering by object type
 *
 * Props:
 * - selectedTypes: Array of selected type values (e.g., ['source', 'model'])
 * - onChange: Callback when selection changes
 * - counts: Object mapping type values to counts (e.g., { source: 5, model: 3 })
 * - showDisabled: Whether to show disabled/coming-soon types (default: false)
 */
const ObjectTypeFilter = ({ selectedTypes = [], onChange, counts = {}, showDisabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const typesToShow = showDisabled ? OBJECT_TYPES : OBJECT_TYPES.filter(type => type.enabled);

  const handleToggle = typeValue => {
    const newSelection = selectedTypes.includes(typeValue)
      ? selectedTypes.filter(t => t !== typeValue)
      : [...selectedTypes, typeValue];
    onChange(newSelection);
  };

  const handleSelectAll = () => {
    const allEnabled = typesToShow.filter(t => t.enabled).map(t => t.value);
    onChange(allEnabled);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  // Build display text
  const getButtonText = () => {
    if (selectedTypes.length === 0) {
      return 'All Types';
    }
    if (selectedTypes.length === 1) {
      const type = OBJECT_TYPES.find(t => t.value === selectedTypes[0]);
      return type?.label || selectedTypes[0];
    }
    return `${selectedTypes.length} types selected`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-2
          px-3 py-2 rounded-md border text-sm
          transition-colors
          ${isOpen ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-300 hover:border-gray-400'}
          ${selectedTypes.length > 0 ? 'bg-primary-50 border-primary-300' : 'bg-white'}
        `}
      >
        <div className="flex items-center gap-2">
          <FilterListIcon fontSize="small" className="text-gray-500" />
          <span className={selectedTypes.length > 0 ? 'text-primary-700 font-medium' : 'text-gray-700'}>
            {getButtonText()}
          </span>
        </div>
        <KeyboardArrowDownIcon
          fontSize="small"
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg border border-gray-200 z-50 py-1">
          {/* Quick actions */}
          <div className="flex justify-between px-3 py-1.5 border-b border-gray-100">
            <button
              onClick={handleClearAll}
              className="text-xs text-gray-500 hover:text-gray-700"
              disabled={selectedTypes.length === 0}
            >
              Clear all
            </button>
            <button
              onClick={handleSelectAll}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Select all
            </button>
          </div>

          {/* Type options */}
          {typesToShow.map(type => {
            const Icon = type.icon;
            const isSelected = selectedTypes.includes(type.value);
            const count = counts[type.value];
            const isDisabled = !type.enabled;
            const colors = type.colors || DEFAULT_COLORS;

            return (
              <button
                key={type.value}
                onClick={() => !isDisabled && handleToggle(type.value)}
                disabled={isDisabled}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                  transition-colors
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}
                  ${isSelected && !isDisabled ? colors.bg : ''}
                `}
              >
                {/* Checkbox indicator */}
                <div
                  className={`
                    w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                    ${isSelected ? `${colors.bg} ${colors.border}` : 'border-gray-300 bg-white'}
                    ${isDisabled ? 'bg-gray-100 border-gray-200' : ''}
                  `}
                >
                  {isSelected && <CheckIcon style={{ fontSize: 12 }} className={colors.text} />}
                </div>

                {/* Icon with type color */}
                <Icon fontSize="small" className={isSelected ? colors.text : 'text-gray-500'} />

                {/* Label */}
                <span className={`flex-1 ${isSelected ? colors.text : 'text-gray-700'}`}>
                  {type.label}
                </span>

                {/* Count badge */}
                {count !== undefined && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? `${colors.bg} ${colors.text}` : 'text-gray-400 bg-gray-100'}`}
                  >
                    {count}
                  </span>
                )}

                {/* Coming soon badge */}
                {isDisabled && (
                  <span className="text-xs text-gray-400 italic">Soon</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ObjectTypeFilter;
