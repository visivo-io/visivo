import React, { useState, useEffect } from 'react';
import { fetchSchema } from '../../api/schema';
import { validateValue, getAvailableProperties, getDefaultValue, validateObject } from '../../utils/draft7Validator';
import ValueRenderer from './friendly-json-editor/ValueRenderer';
import PropertySelector from './friendly-json-editor/PropertySelector';

const FriendlyJsonEditor = ({ data, onChange, objectType }) => {
  const [schema, setSchema] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [availableObjects, setAvailableObjects] = useState({});
  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);

  // Load schema and validate initial data
  useEffect(() => {
    const loadSchema = async () => {
      try {
        const schemaData = await fetchSchema();
        setSchema(schemaData);
        
        // Extract available objects for top-level types
        const objects = {};
        ['models', 'traces', 'charts', 'dashboards', 'tables', 'selectors'].forEach(propName => {
          const prop = schemaData.properties?.[propName];
          if (prop?.items?.oneOf || prop?.items?.$ref) {
            objects[propName.toLowerCase()] = []; // Would need actual object names
          }
        });
        
        setAvailableObjects(objects);
        
        // Validate initial data
        if (data && objectType) {
          const validation = validateObject(schemaData, objectType, data);
          if (!validation.valid) {
            setValidationErrors(validation.errors);
          }
        }
      } catch (err) {
        console.error('Failed to load schema:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSchema();
  }, [data, objectType]);

  // Update data at path with new value
  const handleValueChange = (path, newValue) => {
    const newData = { ...data };
    let current = newData;
    
    // Navigate to the parent object
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    // Update the value
    current[path[path.length - 1]] = newValue;

    // Validate the new value
    const validation = validateValue(schema, objectType, newValue, path);
    
    // Update validation errors
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (!validation.valid) {
        newErrors[path.join('.')] = validation.errors;
      } else {
        delete newErrors[path.join('.')];
      }
      return newErrors;
    });

    onChange(newData);
  };

  // Add item to array
  const handleArrayAdd = (path) => {
    const newData = { ...data };
    let current = newData;
    
    // Navigate to the array
    for (const key of path) {
      current = current[key];
    }
    
    // Add default value
    current.push(getDefaultValue(schema, objectType, [...path, current.length]));
    onChange(newData);
  };

  // Delete item from array
  const handleArrayDelete = (path, index) => {
    const newData = { ...data };
    let current = newData;
    
    // Navigate to the array
    for (const key of path) {
      current = current[key];
    }
    
    // Remove the item
    current.splice(index, 1);
    onChange(newData);
  };

  // Show property selector for adding to object
  const handleObjectAdd = (path) => {
    // Get current object at path
    let current = data;
    for (const key of path) {
      current = current[key];
    }

    // Check if there are properties available to add
    const availableProps = getAvailableProperties(schema, objectType, path, data)
      .filter(prop => !(prop.key in current));

    if (availableProps.length === 0) {
      alert('No more properties available to add');
      return;
    }

    setCurrentPath(path);
    setShowPropertySelector(true);
  };

  // Add selected property to object
  const handlePropertySelect = (propName) => {
    setShowPropertySelector(false);

    const newData = { ...data };
    let current = newData;
    
    // Navigate to the object
    for (const key of currentPath) {
      current = current[key];
    }
    
    // Add property with default value
    current[propName] = getDefaultValue(schema, objectType, [...currentPath, propName]);
    onChange(newData);
  };

  // Delete property from object
  const handleObjectDelete = (path, key) => {
    // Check if property is required
    const properties = getAvailableProperties(schema, objectType, path, data);
    const propertyDef = properties.find(p => p.key === key);
    
    if (propertyDef?.required) {
      alert('Cannot delete required property');
      return;
    }

    const newData = { ...data };
    let current = newData;
    
    // Navigate to the object
    for (const p of path) {
      current = current[p];
    }
    
    // Delete the property
    delete current[key];
    onChange(newData);
  };

  if (loading) {
    return <div className="text-gray-500">Loading schema...</div>;
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <ValueRenderer
        value={data}
        isRoot={true}
        onValueChange={handleValueChange}
        onArrayAdd={handleArrayAdd}
        onArrayDelete={handleArrayDelete}
        onObjectAdd={handleObjectAdd}
        onObjectDelete={handleObjectDelete}
        onInputFocus={() => {}}
        onInputBlur={() => {}}
        validationErrors={validationErrors}
        availableObjects={availableObjects}
        schema={schema}
        objectType={objectType}
      />
      
      {/* Validation errors summary */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">
          <h4 className="font-medium">Validation Errors:</h4>
          <ul className="list-disc list-inside">
            {Object.entries(validationErrors).map(([path, errors]) => (
              <li key={path}>
                {path}: {Array.isArray(errors) ? errors.join(', ') : errors}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Property selector modal */}
      {showPropertySelector && (
        <PropertySelector
          properties={getAvailableProperties(schema, objectType, currentPath, data)
            .filter(prop => !(prop.key in data[currentPath[0]]))}
          onSelect={handlePropertySelect}
          onClose={() => setShowPropertySelector(false)}
        />
      )}
    </div>
  );
};

export default FriendlyJsonEditor; 