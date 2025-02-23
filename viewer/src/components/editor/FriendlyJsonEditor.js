import React, { useState, useEffect } from 'react';
import { HiPlus, HiTrash, HiPencil, HiExclamation, HiX } from 'react-icons/hi';
import { fetchSchema } from '../../api/schema';
import { validateValue, getAvailableProperties, getDefaultValue } from '../../utils/schemaValidation';
import ObjectReferenceSelect from './ObjectReferenceSelect';

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
                  {prop.key}
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

const FriendlyJsonEditor = ({ data, onChange, objectType }) => {
  const [schema, setSchema] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [availableObjects, setAvailableObjects] = useState({});
  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);

  useEffect(() => {
    const loadSchema = async () => {
      try {
        const schemaData = await fetchSchema();
        setSchema(schemaData);
        
        // Extract available objects for each top-level type
        const objects = {};
        Object.entries(schemaData.properties || {}).forEach(([key, prop]) => {
          if (prop.items?.oneOf) {
            objects[key.toLowerCase()] = []; // This would need to be populated with actual object names
          }
        });
        setAvailableObjects(objects);
      } catch (err) {
        console.error('Failed to load schema:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSchema();
  }, []);

  const getValueAtPath = (path) => {
    let current = data;
    for (const key of path) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  };

  const renderValue = (value, path = [], isRoot = false) => {
    console.log('Rendering value:', { value, path, isRoot });

    if (value === null) return <span className="text-gray-400">No value</span>;

    const validation = validateValue(schema, objectType, value, path);
    const properties = getAvailableProperties(schema, objectType, path, getValueAtPath(path.slice(0, -1)));
    const currentProperty = path.length > 0 ? properties.find(p => p.key === path[path.length - 1]) : null;

    console.log('Render context:', { validation, properties, currentProperty });

    // Handle top-level references
    if (currentProperty?.isTopLevelRef) {
      return (
        <ObjectReferenceSelect
          value={value}
          onChange={(newValue) => handleValueChange(path, newValue)}
          availableObjects={availableObjects[currentProperty.type.toLowerCase()] || []}
          type={currentProperty.type}
        />
      );
    }

    if (typeof value === 'boolean') {
      return (
        <select 
          className={`px-2 py-1 rounded border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
          value={value.toString()}
          onChange={(e) => handleValueChange(path, e.target.value === 'true')}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    if (typeof value === 'number') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            className={`px-2 py-1 rounded border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
            value={value}
            onChange={(e) => handleValueChange(path, Number(e.target.value))}
          />
          {!validation.valid && (
            <HiExclamation 
              className="text-red-500" 
              title={validation.errors.join('\n')}
            />
          )}
        </div>
      );
    }

    if (typeof value === 'string') {
      if (currentProperty?.enum) {
        return (
          <div className="flex items-center gap-2">
            <select
              className={`px-2 py-1 rounded border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white w-full`}
              value={value}
              onChange={(e) => handleValueChange(path, e.target.value)}
            >
              {currentProperty.enum.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {!validation.valid && (
              <HiExclamation 
                className="text-red-500" 
                title={validation.errors.join('\n')}
              />
            )}
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2">
          <input
            type="text"
            className={`px-2 py-1 rounded border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white w-full`}
            value={value}
            onChange={(e) => handleValueChange(path, e.target.value)}
          />
          {!validation.valid && (
            <HiExclamation 
              className="text-red-500" 
              title={validation.errors.join('\n')}
            />
          )}
        </div>
      );
    }

    if (Array.isArray(value)) {
      console.log('Rendering array:', { path, value });
      return (
        <div className="pl-4 border-l-2 border-gray-200">
          {value.map((item, index) => (
            <div key={index} className="mb-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">Item {index + 1}</span>
                <button
                  onClick={() => handleArrayDelete(path, index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              </div>
              {renderValue(item, [...path, index])}
            </div>
          ))}
          <button
            onClick={() => handleArrayAdd(path)}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
          >
            <HiPlus className="w-4 h-4" /> Add Item
          </button>
        </div>
      );
    }

    if (typeof value === 'object') {
      console.log('Rendering object:', { path, value });
      const availableProperties = getAvailableProperties(schema, objectType, path, getValueAtPath(path));
      console.log('Available properties:', availableProperties);

      return (
        <div className={isRoot ? '' : 'pl-4 border-l-2 border-gray-200'}>
          {Object.entries(value).map(([key, val]) => {
            const propertyDef = availableProperties.find(p => p.key === key);
            console.log('Property definition:', { key, propertyDef });

            return (
              <div key={key} className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="font-medium text-gray-700">
                      {formatKey(key)}
                      {propertyDef?.required && <span className="text-red-500">*</span>}
                    </span>
                    {propertyDef?.description && (
                      <span className="text-sm text-gray-500">{propertyDef.description}</span>
                    )}
                    <button
                      onClick={() => handleKeyEdit(path, key)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <HiPencil className="w-3 h-3" />
                    </button>
                  </div>
                  {!isRoot && (
                    <button
                      onClick={() => handleObjectDelete(path, key)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <HiTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {renderValue(val, [...path, key])}
              </div>
            );
          })}
          <button
            onClick={() => handleObjectAdd(path)}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
          >
            <HiPlus className="w-4 h-4" /> Add Property
          </button>
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  const formatKey = (key) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleValueChange = (path, newValue) => {
    const newData = { ...data };
    let current = newData;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = newValue;

    // Validate the new value
    const validation = validateValue(schema, objectType, newValue, path);
    if (!validation.valid) {
      setValidationErrors(prev => ({
        ...prev,
        [path.join('.')]: validation.errors
      }));
    } else {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[path.join('.')];
        return newErrors;
      });
    }

    onChange(newData);
  };

  const handleArrayAdd = (path) => {
    const newData = { ...data };
    let current = newData;
    for (const key of path) {
      current = current[key];
    }
    const defaultValue = getDefaultValue(schema, objectType, [...path, current.length]);
    current.push(defaultValue);
    onChange(newData);
  };

  const handleArrayDelete = (path, index) => {
    const newData = { ...data };
    let current = newData;
    for (const key of path) {
      current = current[key];
    }
    current.splice(index, 1);
    onChange(newData);
  };

  const handleObjectAdd = (path) => {
    const properties = getAvailableProperties(schema, objectType, path, getValueAtPath(path));
    
    // Get current object at path
    let current = data;
    for (const key of path) {
      current = current[key];
    }

    // Filter out properties that already exist
    const availableProps = properties.filter(
      prop => !(prop.key in current)
    );

    if (availableProps.length === 0) {
      alert('No more properties available to add');
      return;
    }

    setCurrentPath(path);
    setShowPropertySelector(true);
  };

  const handlePropertySelect = (propName) => {
    setShowPropertySelector(false);

    const newData = { ...data };
    let current = newData;
    for (const key of currentPath) {
      current = current[key];
    }

    current[propName] = getDefaultValue(schema, objectType, [...currentPath, propName]);
    onChange(newData);
  };

  const handleObjectDelete = (path, key) => {
    const properties = getAvailableProperties(schema, objectType);
    const propertyDef = properties.find(p => p.key === key);
    
    if (propertyDef?.required) {
      alert('Cannot delete required property');
      return;
    }

    const newData = { ...data };
    let current = newData;
    for (const p of path) {
      current = current[p];
    }
    delete current[key];
    onChange(newData);
  };

  const handleKeyEdit = (path, oldKey) => {
    const properties = getAvailableProperties(schema, objectType);
    const propertyDef = properties.find(p => p.key === oldKey);
    
    if (propertyDef?.required) {
      alert('Cannot rename required property');
      return;
    }

    const newKey = prompt('Enter new property name:', oldKey);
    if (newKey && newKey !== oldKey) {
      if (!properties.some(p => p.key === newKey)) {
        alert('Invalid property name');
        return;
      }

      const newData = { ...data };
      let current = newData;
      for (const p of path) {
        current = current[p];
      }
      current[newKey] = current[oldKey];
      delete current[oldKey];
      onChange(newData);
    }
  };

  if (loading) {
    return <div className="text-gray-500">Loading schema...</div>;
  }

  return (
    <div className="p-4 bg-white rounded-lg">
      {renderValue(data, [], true)}
      {Object.keys(validationErrors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">
          <h4 className="font-medium">Validation Errors:</h4>
          <ul className="list-disc list-inside">
            {Object.entries(validationErrors).map(([path, errors]) => (
              <li key={path}>{errors.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
      {showPropertySelector && (
        <PropertySelector
          properties={getAvailableProperties(schema, objectType, currentPath)}
          onSelect={handlePropertySelect}
          onClose={() => setShowPropertySelector(false)}
        />
      )}
    </div>
  );
};

export default FriendlyJsonEditor; 