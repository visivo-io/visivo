import React, { useState, useMemo } from 'react';
import ObjectPill from './ObjectPill';
import useStore from '../../stores/store';
import { shallow } from 'zustand/shallow';

const ObjectsPanel = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  
  // Use the store for state management
  const isLoading = useStore((state) => state.isLoading);
  const error = useStore((state) => state.error);

  const namedChildrenAndType = useStore(
    (state) => state.namedChildren,
    shallow
  );

  const mappedObjects = useMemo(() => {
    return Object.entries(namedChildrenAndType).map(([key, { type }]) => ({ 
        name: key, 
        type 
    }));
  }, [namedChildrenAndType]);

  const uniqueTypes = useMemo(() => {
    const types = [...new Set(mappedObjects.map(item => item.type))];
    return types.sort();
  }, [mappedObjects]);

  const filteredObjects = useMemo(() => {
    return mappedObjects.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = !selectedType || item.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [mappedObjects, searchTerm, selectedType]);

  if (isLoading) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 p-4 h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 p-4 h-full">
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 h-full flex flex-col">
      <input
        type="text"
        placeholder="Search objects..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <select
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
      >
        <option value="">All Types</option>
        {uniqueTypes.map(type => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
      <div className="overflow-y-auto flex-1">
        {filteredObjects.length === 0 ? (
          <div className="text-gray-500 text-sm">No objects found</div>
        ) : (
          filteredObjects.map(obj => (
            <ObjectPill 
              key={obj.name}
              name={obj.name}
              type={obj.type}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ObjectsPanel; 