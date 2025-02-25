import React, { useState, useEffect } from 'react';
import { fetchSchema } from '../../api/schema';
import { validateValue, getAvailableProperties, getDefaultValue } from '../../utils/schemaValidation';
import ValueRenderer from './friendly-json-editor/ValueRenderer';
import PropertySelector from './friendly-json-editor/PropertySelector';

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
    const properties = getAvailableProperties(schema, objectType, path, data);
    
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
    const properties = getAvailableProperties(schema, objectType, path, data);
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
        onInputFocus={handleInputFocus}
        onInputBlur={handleInputBlur}
        availableObjects={availableObjects}
      />
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
          properties={getAvailableProperties(schema, objectType, currentPath, data)}
          onSelect={handlePropertySelect}
          onClose={() => setShowPropertySelector(false)}
        />
      )}
    </div>
  );
};

export default FriendlyJsonEditor; 