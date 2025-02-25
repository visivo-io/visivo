import React, { useState, useEffect } from 'react';
import { HiPlus, HiTrash, HiPencil, HiExclamation, HiX, HiInformationCircle } from 'react-icons/hi';
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

// Helper function to split description into validation suggestion and explanation
const splitDescription = (description) => {
  if (!description) return { suggestion: '', explanation: '' };
  
  const parts = description.split('<br>');
  return {
    suggestion: parts[0] || '',
    explanation: parts.length > 1 ? parts.slice(1).join('<br>') : ''
  };
};

// Format property key for display
const formatKey = (key) => {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const FriendlyJsonEditor = ({ data, onChange, objectType }) => {
  const [schema, setSchema] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [availableObjects, setAvailableObjects] = useState({});
  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [focusedInputs, setFocusedInputs] = useState({});

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

  const handleInputFocus = (path) => {
    setFocusedInputs(prev => ({
      ...prev,
      [path.join('.')]: true
    }));
  };

  const handleInputBlur = (path) => {
    setFocusedInputs(prev => ({
      ...prev,
      [path.join('.')]: false
    }));
  };

  // Helper function to render a field label with explanation icon
  const renderFieldLabel = (property, key) => {
    // If property is provided directly, use it
    if (property) {
      const { explanation } = property.description 
        ? splitDescription(property.description) 
        : { explanation: '' };
      
      return (
        <label className="text-xs font-medium text-gray-700 mb-1 block">
          {formatKey(property.key)}
          {property.required && <span className="text-red-500 ml-1">*</span>}
          {explanation && (
            <span className="ml-1 inline-block">
              <HiInformationCircle 
                className="w-4 h-4 text-gray-400 hover:text-gray-600 inline" 
                title={explanation}
              />
            </span>
          )}
        </label>
      );
    }
    
    // If no property but key is provided (for nested objects)
    if (key) {
      return (
        <label className="text-xs font-medium text-gray-700 mb-1 block">
          {formatKey(key)}
        </label>
      );
    }
    
    return null;
  };

  const renderValue = (value, path = [], isRoot = false) => {
    if (value === null) return <span className="text-gray-400">No value</span>;

    const validation = validateValue(schema, objectType, value, path);
    const properties = getAvailableProperties(schema, objectType, path, getValueAtPath(path.slice(0, -1)));
    const currentProperty = path.length > 0 ? properties.find(p => p.key === path[path.length - 1]) : null;
    
    const pathKey = path.join('.');
    const isFocused = focusedInputs[pathKey];
    
    // Split description into validation suggestion and explanation
    const { suggestion, explanation } = currentProperty?.description 
      ? splitDescription(currentProperty.description) 
      : { suggestion: '', explanation: '' };

    // Handle top-level references
    if (currentProperty?.isTopLevelRef) {
      return (
        <div className="relative mb-4">
          {renderFieldLabel(currentProperty)}
          <ObjectReferenceSelect
            value={value}
            onChange={(newValue) => handleValueChange(path, newValue)}
            availableObjects={availableObjects[currentProperty.type.toLowerCase()] || []}
            type={currentProperty.type}
          />
        </div>
      );
    }

    if (typeof value === 'boolean') {
      return (
        <div className="relative mb-4">
          {renderFieldLabel(currentProperty)}
          <select 
            className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
            value={value.toString()}
            onChange={(e) => handleValueChange(path, e.target.value === 'true')}
            title={suggestion}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
          {!validation.valid && (
            <div className="absolute right-2 top-[calc(50%+10px)] transform -translate-y-1/2">
              <HiExclamation 
                className="text-red-500 w-5 h-5" 
                title={validation.errors.join('\n')}
              />
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'number') {
      return (
        <div className="relative mb-4">
          {renderFieldLabel(currentProperty)}
          <input
            type="number"
            className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
            value={value}
            onChange={(e) => handleValueChange(path, Number(e.target.value))}
            onFocus={() => handleInputFocus(path)}
            onBlur={() => handleInputBlur(path)}
            title={suggestion}
          />
          {!validation.valid && (
            <div className="absolute right-2 top-[calc(50%+10px)] transform -translate-y-1/2">
              <HiExclamation 
                className="text-red-500 w-5 h-5" 
                title={validation.errors.join('\n')}
              />
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'string') {
      if (currentProperty?.enum) {
        return (
          <div className="relative mb-4">
            {renderFieldLabel(currentProperty)}
            <select
              className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
              value={value}
              onChange={(e) => handleValueChange(path, e.target.value)}
              title={suggestion}
            >
              <option value="" disabled>
                Select {formatKey(currentProperty?.key || '')}
              </option>
              {currentProperty.enum.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {!validation.valid && (
              <div className="absolute right-2 top-[calc(50%+10px)] transform -translate-y-1/2">
                <HiExclamation 
                  className="text-red-500 w-5 h-5" 
                  title={validation.errors.join('\n')}
                />
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="relative mb-4">
          {renderFieldLabel(currentProperty)}
          <input
            type="text"
            className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
            value={value}
            onChange={(e) => handleValueChange(path, e.target.value)}
            onFocus={() => handleInputFocus(path)}
            onBlur={() => handleInputBlur(path)}
            title={suggestion}
          />
          {!validation.valid && (
            <div className="absolute right-2 top-[calc(50%+10px)] transform -translate-y-1/2">
              <HiExclamation 
                className="text-red-500 w-5 h-5" 
                title={validation.errors.join('\n')}
              />
            </div>
          )}
        </div>
      );
    }

    if (Array.isArray(value)) {
      return (
        <div className="pl-4 border-l-2 border-gray-200 mb-4">
          {renderFieldLabel(currentProperty)}
          {value.map((item, index) => (
            <div key={index} className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500">Item {index + 1}</span>
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
      const availableProperties = getAvailableProperties(schema, objectType, path, getValueAtPath(path));
      
      // For top-level objects, render as cards in a grid
      if (isRoot) {
        // Filter out the excluded top-level properties
        const filteredEntries = Object.entries(value).filter(([key]) => 
          !['path', 'name', 'changed'].includes(key.toLowerCase())
        );
        
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEntries.map(([key, val]) => {
              const propertyDef = availableProperties.find(p => p.key === key);
              const { explanation } = propertyDef?.description 
                ? splitDescription(propertyDef.description) 
                : { explanation: '' };
              
              return (
                <div key={key} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-800">
                      {formatKey(key)}
                      {propertyDef?.required && <span className="text-red-500 ml-1">*</span>}
                    </h3>
                    {explanation && (
                      <span>
                        <HiInformationCircle 
                          className="w-5 h-5 text-gray-400 hover:text-gray-600" 
                          title={explanation}
                        />
                      </span>
                    )}
                  </div>
                  {renderValue(val, [...path, key])}
                </div>
              );
            })}
            <div className="bg-white rounded-lg border border-dashed border-gray-300 p-4 flex items-center justify-center">
              <button
                onClick={() => handleObjectAdd(path)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
              >
                <HiPlus className="w-5 h-5" /> Add Property
              </button>
            </div>
          </div>
        );
      }
      
      // For nested objects
      return (
        <div className={isRoot ? '' : 'pl-4 border-l-2 border-gray-200 mb-4'}>
          {renderFieldLabel(currentProperty)}
          {Object.entries(value).map(([key, val]) => {
            const propertyDef = availableProperties.find(p => p.key === key);
            const { explanation } = propertyDef?.description 
              ? splitDescription(propertyDef.description) 
              : { explanation: '' };
            
            return (
              <div key={key} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center">
                    <span className="text-xs font-medium text-gray-700">
                      {formatKey(key)}
                      {propertyDef?.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                    {explanation && (
                      <span className="ml-1">
                        <HiInformationCircle 
                          className="w-4 h-4 text-gray-400 hover:text-gray-600 inline" 
                          title={explanation}
                        />
                      </span>
                    )}
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
    <div className="p-4 bg-gray-50 rounded-lg">
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