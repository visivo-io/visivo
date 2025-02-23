import React from 'react';
import { HiSearch } from 'react-icons/hi';

const ObjectReferenceSelect = ({ value, onChange, availableObjects, type }) => {
  return (
    <div className="relative">
      <div className="flex items-center">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Search ${type}s...`}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        />
        <HiSearch className="absolute right-3 top-3 text-gray-400" />
      </div>
      {value && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {availableObjects
            .filter(obj => obj.toLowerCase().includes(value.toLowerCase()))
            .map(obj => (
              <button
                key={obj}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                onClick={() => onChange(`ref(${obj})`)}
              >
                {obj}
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
};

export default ObjectReferenceSelect; 