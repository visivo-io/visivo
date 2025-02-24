import React, { useState, useEffect, useMemo } from 'react';
import { fetchNamedChildren } from '../../api/namedChildren';
import ObjectPill from './ObjectPill';

const ObjectsPanel = ({ onObjectOpen }) => {
  const [objects, setObjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchObjects = async () => {
      try {
        const data = await fetchNamedChildren();
        if (data) {
          const objectsArray = Object.entries(data).map(([name, details]) => ({
            name,
            type: details.type,
            config: JSON.parse(details.config)
          }));
          setObjects(objectsArray.sort((a, b) => a.name.localeCompare(b.name)));
        }
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch objects');
        setLoading(false);
      }
    };

    fetchObjects();
  }, []);

  const uniqueTypes = useMemo(() => {
    const types = [...new Set(objects.map(obj => obj.type))];
    return types.sort();
  }, [objects]);

  const filteredObjects = useMemo(() => {
    return objects.filter(obj => {
      const matchesSearch = obj.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = !selectedType || obj.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [objects, searchTerm, selectedType]);

  if (loading) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4">
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search objects..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <select
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="">All Types</option>
          {uniqueTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {filteredObjects.length === 0 ? (
          <div className="text-gray-500 text-sm">No objects found</div>
        ) : (
          filteredObjects.map(obj => (
            <ObjectPill
              key={obj.name}
              object={obj}
              onObjectOpen={onObjectOpen}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ObjectsPanel; 