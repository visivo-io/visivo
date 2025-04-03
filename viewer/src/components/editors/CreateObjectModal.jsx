import React, { useState, useEffect } from 'react';
import { TYPE_STYLE_MAP } from '../../components/styled/VisivoObjectStyles';
import useStore from '../../stores/store';
import { fetchSchema } from '../../api/schema';

const CreateObjectModal = ({ isOpen, onClose }) => {
  const [schema, setSchema] = useState(null);
  const [step, setStep] = useState('property'); // 'property' | 'type' | 'name'
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [objectName, setObjectName] = useState('');
  
  const openTab = useStore(state => state.openTab);
  const namedChildren = useStore(state => state.namedChildren);

  // Reset all state to initial values
  const resetState = () => {
    setStep('property');
    setSelectedProperty(null);
    setSelectedType(null);
    setObjectName('');
  };

  // Add effect to reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  useEffect(() => {
    const loadSchema = async () => {
      console.log('Fetching schema...');
      try {
        const schemaData = await fetchSchema();
        console.log('Schema response:', schemaData);
        setSchema(schemaData);
      } catch (error) {
        console.error('Error fetching schema:', error);
      }
    };
    loadSchema();
  }, []);

  // Add debug logging for schema state changes
  useEffect(() => {
    console.log('Current schema state:', schema);
    if (schema?.properties) {
      console.log('Available properties:', 
        Object.keys(schema.properties)
          .filter(key => schema.properties[key]?.type === 'array')
      );
    }
  }, [schema]);

  const getValidTypesForProperty = (prop) => {
    if (!schema?.properties) return [];
    console.log('Getting valid types for property:', prop);
    
    const propSchema = schema.properties[prop];
    console.log('Property schema:', propSchema);
    
    if (propSchema?.items?.oneOf) {
      const types = propSchema.items.oneOf.map(item => {
        const typePath = item.$ref.split('/');
        return typePath[typePath.length - 1];
      });
      console.log('Found oneOf types:', types);
      return types;
    } else if (propSchema?.items?.$ref) {
      const typePath = propSchema.items.$ref.split('/');
      const type = typePath[typePath.length - 1];
      console.log('Found single type:', type);
      return [type];
    }
    console.log('No valid types found');
    return [];
  };

  const handlePropertySelect = (prop) => {
    setSelectedProperty(prop);
    const validTypes = getValidTypesForProperty(prop);
    if (validTypes.length === 1) {
      setSelectedType(validTypes[0]);
      setStep('name');
    } else {
      setStep('type');
    }
  };

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setStep('name');
  };

  const handleCreate = () => {
    if (!objectName || !selectedType || !selectedProperty) return;

    // Create new object with default configuration
    const newObject = {
      type: selectedType,
      config: {},
      status: 'Modified'
    };

    // Update store with new object
    useStore.setState({
      namedChildren: {
        ...namedChildren,
        [objectName]: newObject
      }
    });

    // Open the new object in a tab
    openTab(objectName, selectedType);
    
    // Reset state and close modal
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Create New Object</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        {step === 'property' && schema && (
          <div className="grid grid-cols-2 gap-4">
            {Object.keys(schema.properties)
              .filter(key => schema.properties[key]?.type === 'array')
              .map(prop => (
                <button
                  key={prop}
                  onClick={() => handlePropertySelect(prop)}
                  className="p-4 border rounded-lg hover:bg-gray-50 text-left"
                >
                  <div className="font-medium capitalize">{prop}</div>
                  <div className="text-sm text-gray-500">
                    {schema.properties[prop]?.description || `Create a new ${prop} object`}
                  </div>
                </button>
              ))}
          </div>
        )}

        {step === 'type' && (
          <div className="grid grid-cols-2 gap-4">
            {getValidTypesForProperty(selectedProperty).map(type => {
              const style = TYPE_STYLE_MAP[type] || {};
              const Icon = style.icon;
              
              return (
                <button
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  className={`p-4 border rounded-lg hover:opacity-80 flex flex-col items-center ${style.bg} ${style.border}`}
                >
                  {Icon && <Icon className={`text-2xl ${style.text}`} />}
                  <span className={`mt-2 font-medium ${style.text}`}>{type}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === 'name' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Object Name
              </label>
              <input
                type="text"
                value={objectName}
                onChange={(e) => setObjectName(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                placeholder="Enter object name..."
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!objectName}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Create Object
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateObjectModal; 