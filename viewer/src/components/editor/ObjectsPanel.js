import React, { useState, useEffect, useMemo } from 'react';
import { fetchNamedChildren } from '../../api/namedChildren';
import { HiOutlineChartBar, HiOutlineDatabase, HiOutlineViewGrid, HiOutlineSelector, HiOutlineTable } from 'react-icons/hi';

const TYPE_COLORS = {
  'ChartModel': {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: HiOutlineChartBar
  },
  'CsvScriptModel': {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: HiOutlineDatabase
  },
  'Dashboard': {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: HiOutlineViewGrid
  },
  'Selector': {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    icon: HiOutlineSelector
  },
  'Table': {
    bg: 'bg-pink-100',
    text: 'text-pink-800',
    border: 'border-pink-200',
    icon: HiOutlineTable
  }
};

const ObjectsPanel = () => {
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
          // Transform the object into an array with name and type
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

  const ObjectPill = ({ name, type }) => {
    const typeConfig = TYPE_COLORS[type] || {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      border: 'border-gray-200',
      icon: HiOutlineDatabase
    };
    const Icon = typeConfig.icon;

    return (
      <div className={`flex items-center p-2 mb-2 rounded-lg border ${typeConfig.bg} ${typeConfig.border} cursor-pointer hover:opacity-80 transition-opacity`}>
        <Icon className={`w-5 h-5 mr-2 ${typeConfig.text}`} />
        <span className={`text-sm font-medium ${typeConfig.text} truncate`}>
          {name}
        </span>
      </div>
    );
  };

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