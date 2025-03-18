import React, { useState, useEffect } from 'react';
import { HiX, HiSearch, HiOutlineInformationCircle } from 'react-icons/hi';
import { formatKey } from './utils';

// Property card component extracted for reuse
const PropertyCard = ({ property, onSelect }) => (
  <button
    className="w-full text-left p-3 hover:bg-gray-50 rounded-lg mb-2 border border-gray-200"
    onClick={() => onSelect(property.key)}
  >
    <div className="flex items-center justify-between">
      <span className="font-medium">
        {formatKey(property.key)}
        {property.required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <div className="flex items-center">
        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
          {property.format ? `${property.type}:${property.format}` : property.type}
        </span>
        {property.description && (
          <HiOutlineInformationCircle 
            className="w-4 h-4 text-gray-400 ml-1" 
            title={property.description}
          />
        )}
      </div>
    </div>
    
    {property.description && (
      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
        {property.description.split('<br>')[0]}
      </p>
    )}
    
    {property.enum && (
      <div className="mt-1 flex flex-wrap gap-1">
        {property.enum.slice(0, 5).map(value => (
          <span key={value} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
            {value}
          </span>
        ))}
        {property.enum.length > 5 && (
          <span className="text-xs px-1.5 py-0.5 bg-gray-50 text-gray-700 rounded">
            +{property.enum.length - 5} more
          </span>
        )}
      </div>
    )}
  </button>
);

const PropertySelector = ({ properties, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  
  // Get unique types
  const types = [...new Set(properties.map(prop => prop.type || 'other'))].sort();
  
  // Filter properties based on search term and selected type
  const filteredProperties = properties.filter(prop => {
    const matchesSearch = !searchTerm || 
      prop.key.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (prop.description && prop.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = !selectedType || prop.type === selectedType;
    
    return matchesSearch && matchesType;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Add Property</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-3 border-b border-gray-200 flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <HiSearch className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search properties..."
              className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="">All Types</option>
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 p-3">
          {filteredProperties.length > 0 ? (
            filteredProperties.map(prop => (
              <PropertyCard key={prop.key} property={prop} onSelect={onSelect} />
            ))
          ) : (
            <div className="text-gray-500 text-center py-4">
              No properties found matching your criteria
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end">
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