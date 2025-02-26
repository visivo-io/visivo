import React, { useState, useEffect } from 'react';
import { HiX, HiSearch, HiOutlineInformationCircle } from 'react-icons/hi';
import { formatKey } from './utils';

const PropertySelector = ({ properties, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [groupedProperties, setGroupedProperties] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});

  // Group properties by type
  useEffect(() => {
    const grouped = properties.reduce((acc, prop) => {
      const type = prop.type || 'other';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(prop);
      return acc;
    }, {});
    
    setGroupedProperties(grouped);
    
    // Expand all groups by default
    const expanded = {};
    Object.keys(grouped).forEach(type => {
      expanded[type] = true;
    });
    setExpandedGroups(expanded);
  }, [properties]);

  const types = Object.keys(groupedProperties);
  
  // Filter properties based on search term and selected type
  const getFilteredProperties = () => {
    let filtered = [...properties];
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(prop => 
        prop.key.toLowerCase().includes(lowerSearch) || 
        (prop.description && prop.description.toLowerCase().includes(lowerSearch))
      );
    }
    
    if (selectedType) {
      filtered = filtered.filter(prop => prop.type === selectedType);
    }
    
    return filtered;
  };

  const filteredProperties = getFilteredProperties();
  
  // Toggle a group's expanded state
  const toggleGroup = (type) => {
    setExpandedGroups(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Add Property</h2>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-200 flex gap-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <HiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search properties..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="">All Types</option>
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {searchTerm || selectedType ? (
            // Show flat list when filtering
            <>
              {filteredProperties.length > 0 ? (
                filteredProperties.map(prop => (
                  <PropertyCard 
                    key={prop.key} 
                    property={prop} 
                    onSelect={onSelect} 
                  />
                ))
              ) : (
                <div className="text-gray-500 text-center py-4">
                  No properties found matching your criteria
                </div>
              )}
            </>
          ) : (
            // Show grouped list when not filtering
            <>
              {types.map(type => (
                <div key={type} className="mb-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer p-2 bg-gray-50 rounded-lg mb-2"
                    onClick={() => toggleGroup(type)}
                  >
                    <h3 className="font-medium text-gray-700 capitalize">{type}</h3>
                    <span className="text-sm text-gray-500">
                      {groupedProperties[type].length} properties
                    </span>
                  </div>
                  
                  {expandedGroups[type] && (
                    <div className="pl-2">
                      {groupedProperties[type].map(prop => (
                        <PropertyCard 
                          key={prop.key} 
                          property={prop} 
                          onSelect={onSelect} 
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
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

// Property card component
const PropertyCard = ({ property, onSelect }) => {
  return (
    <button
      className="w-full text-left p-3 hover:bg-gray-50 rounded-lg mb-2 border border-gray-200 transition-colors"
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
            <span className="ml-1">
              <HiOutlineInformationCircle 
                className="w-4 h-4 text-gray-400 hover:text-gray-600" 
                title={property.description}
              />
            </span>
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
          {property.enum.map(value => (
            <span key={value} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
              {value}
            </span>
          ))}
        </div>
      )}
      
      {(property.minimum !== undefined || property.maximum !== undefined) && (
        <p className="text-xs text-gray-500 mt-1">
          {property.minimum !== undefined && property.maximum !== undefined
            ? `Range: ${property.minimum} to ${property.maximum}`
            : property.minimum !== undefined
              ? `Min: ${property.minimum}`
              : `Max: ${property.maximum}`
          }
        </p>
      )}
    </button>
  );
};

export default PropertySelector; 