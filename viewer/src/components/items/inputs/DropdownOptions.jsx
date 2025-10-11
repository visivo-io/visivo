import React from 'react';
import { FaCheck } from 'react-icons/fa';

const DropdownOptions = ({
  options,
  filteredOptions,
  isSelected,
  toggleSelection,
  highlightedIndex,
  isMulti,
  selectedItems,
}) => {
  return (
    <>
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

      {isMulti && (
        <div className="p-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 text-center">
          {selectedItems.length} of {options.length} selected
        </div>
      )}
    </>
  );
};

export default DropdownOptions;
