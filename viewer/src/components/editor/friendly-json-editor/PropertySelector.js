import React, { useState } from 'react';
import { HiX } from 'react-icons/hi';
import { formatKey } from './utils';

const PropertySelector = ({ properties, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');

  const types = [...new Set(properties.map(p => p.type))];
  const filteredProperties = properties.filter(prop => {
    const matchesSearch = prop.key.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !selectedType || prop.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Add Property</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-200 flex gap-4">
          <input
            type="text"
            placeholder="Search properties..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="">All Types</option>
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {filteredProperties.map(prop => (
            <button
              key={prop.key}
              className="w-full text-left p-3 hover:bg-gray-50 rounded-lg mb-2 border border-gray-200"
              onClick={() => onSelect(prop.key)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {formatKey(prop.key)}
                  {prop.required && <span className="text-red-500 ml-1">*</span>}
                </span>
                <span className="text-sm text-gray-500">{prop.type}</span>
              </div>
              {prop.description && (
                <p className="text-sm text-gray-600 mt-1">{prop.description}</p>
              )}
              {prop.enum && (
                <p className="text-sm text-gray-500 mt-1">
                  Options: {prop.enum.join(', ')}
                </p>
              )}
            </button>
          ))}
          {filteredProperties.length === 0 && (
            <div className="text-gray-500 text-center py-4">
              No properties found
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertySelector; 