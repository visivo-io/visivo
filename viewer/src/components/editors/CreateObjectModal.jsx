import React, { useState, useEffect, useCallback } from 'react';
import { TYPE_STYLE_MAP, TYPE_VALUE_MAP } from '../../components/styled/VisivoObjectStyles';
import { PROPERTY_STYLE_MAP } from '../../components/styled/PropertyStyles';
import useStore from '../../stores/store';

const OPTIONAL_REQUIREMENTS = ["host", "username", "password", "warehouse", "account", "project"]

const CreateObjectModal = ({ isOpen, onClose, objSelectedProperty, objStep = 'property', onSubmitCallback }) => {
  const [step, setStep] = useState(objStep); // 'property' | 'type' | 'name' | 'attributes'
  const [selectedProperty, setSelectedProperty] = useState(objSelectedProperty);
  const [selectedType, setSelectedType] = useState(null);
  const [objectName, setObjectName] = useState('');
  const [attributes, setAttributes] = useState({});
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [selectedSource, setSelectedSource] = useState(null)

  const schema = useStore(state => state.schema);
  const openTab = useStore(state => state.openTab);
  const namedChildren = useStore(state => state.namedChildren);

  const projectFileObjects = useStore(state => state.projectFileObjects);
  const projectFilePath = useStore(state => state.projectFilePath);

  // Reset all state to initial values
  const resetState = useCallback(() => {
  setStep(objStep);
  setSelectedProperty(objSelectedProperty);
  setSelectedType(null);
  setObjectName('');
  setAttributes({});
  setSelectedFilePath('');
}, [objStep, objSelectedProperty]);

  // Add effect to reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);


  const getValidTypesForProperty = prop => {
    if (!schema?.properties) return [];

    const propSchema = schema.properties[prop];

    if (propSchema?.items?.oneOf) {
      const types = propSchema.items.oneOf.map(item => {
        const typePath = item.$ref.split('/');
        return typePath[typePath.length - 1];
      });

      return types;
    } else if (propSchema?.items?.$ref) {
      const typePath = propSchema.items.$ref.split('/');
      const type = typePath[typePath.length - 1];

      return [type];
    }
    return [];
  };

  const handlePropertySelect = prop => {
    setSelectedProperty(prop);
    const validTypes = getValidTypesForProperty(prop);
    if (validTypes.length === 1) {
      setSelectedType(validTypes[0]);
      setStep('name');
    } else {
      setStep('type');
    }
  };

  const handleTypeSelect = type => {
    setSelectedSource(TYPE_VALUE_MAP[type])
    setSelectedType(type);
    setStep('name');
  };

  const getRequiredAttributes = type => {
    if (!schema?.$defs?.[type]) return [];

    const typeSchema = schema.$defs[type];

    let mergedRequired = typeSchema.required || [];
    const properties = typeSchema.properties || {};

    if (onSubmitCallback) {
        mergedRequired = [
        ...new Set([
          ...mergedRequired,
          ...OPTIONAL_REQUIREMENTS.filter(optKey => optKey in properties),
        ]),
      ];
    }
    
    // Filter out 'name' since we already have it
    return mergedRequired
      .filter(key => key !== 'name')
      .map(key => ({
        name: key,
        ...properties[key],
      }));
  };

  const handleNameSubmit = () => {
    const requiredAttributes = getRequiredAttributes(selectedType);
    if (requiredAttributes.length > 0) {
      setStep('attributes');
    } else {
      handleCreate();
    }
  };

  const handleAttributesSubmit = () => {
    handleCreate();
  };

  const handleCreate = () => {
    if (!objectName || !selectedType || !selectedProperty) return;

    // Get the type_key from the property map
    const type_key = selectedProperty; // This is the key from PROPERTY_STYLE_MAP

    // Create new object with all required attributes
    const newObject = {
      type: selectedType,
      type_key: type_key,
      config: {
        name: objectName,
        ...attributes,
        type: selectedSource.value
      },
      status: 'New', // Set status to New for new objects
      file_path: selectedFilePath || projectFilePath, // defaults to existing project file path
      new_file_path: selectedFilePath || projectFilePath,
      path: null
    };

    // Update store with new object
    useStore.setState({
      namedChildren: {
        ...namedChildren,
        [objectName]: newObject,
      },
    });
    // Open the new object in a tab
    if (onSubmitCallback) {
      onSubmitCallback(newObject)
    }else{
      openTab(objectName, selectedType);
    }

    resetState();
    onClose();
  };

  const getDisplayName = () => {
    if (selectedType) {
      // If we have a selected type, use that
      return TYPE_STYLE_MAP[selectedType]?.displayName || selectedType;
    } else if (selectedProperty) {
      // If we only have a property selected, use its singular form
      return PROPERTY_STYLE_MAP[selectedProperty]?.displayName || selectedProperty;
    }
    return 'Object';
  };

  if (!isOpen) return null;

  const displayName = getDisplayName();

  return (
    <div className="fixed inset-0 backdrop flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-[750px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Create New {displayName}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        {step === 'property' && schema && (
          <div className="grid grid-cols-3 gap-4">
            {Object.keys(schema.properties)
              .filter(key => schema.properties[key]?.type === 'array')
              .map(prop => {
                const style = PROPERTY_STYLE_MAP[prop] || {};
                const Icon = style.icon;

                return (
                  <button
                    key={prop}
                    onClick={() => handlePropertySelect(prop)}
                    className={`p-3 border rounded-lg hover:opacity-80 flex flex-col items-center ${style.bg} ${style.border}`}
                  >
                    {Icon && <Icon className={`text-2xl mb-1 ${style.text}`} />}
                    <span className={`font-medium ${style.text}`}>{style.displayName || prop}</span>
                    <span className="text-xs text-gray-600 mt-1 text-center">
                      {style.description ||
                        schema.properties[prop]?.description ||
                        `Create a new ${prop} object`}
                    </span>
                  </button>
                );
              })}
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
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={objectName}
                onChange={e => setObjectName(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                placeholder={`Enter ${displayName.toLowerCase()} name...`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">File Path</label>
              <select
                value={selectedFilePath}
                onChange={e => setSelectedFilePath(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              >
                <option value="">Select a file...</option>
                {projectFileObjects.map(pathObj => (
                  <option key={pathObj.full_path} value={pathObj.full_path}>
                    {pathObj.relative_path}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select the file where you want to save this {displayName.toLowerCase()}. Default is
                the project file path.
              </p>
            </div>

            <button
              onClick={handleNameSubmit}
              disabled={!objectName}
              className="w-full bg-[#713B57] text-white py-2 px-4 rounded-lg hover:bg-[#5A2F46] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {step === 'attributes' && (
          <div className="space-y-4">
            {getRequiredAttributes(selectedType).map(attr => (
              <div key={attr.name} className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  {attr.title || attr.name} {!OPTIONAL_REQUIREMENTS.includes(attr.name) && <span className="text-red-500"> *</span>}
                </label>
                {attr.description && (
                  <p className="text-xs text-gray-500 mb-1">{attr.description}</p>
                )}

                {/* String input */}
                {((attr.type === 'string' || !attr.type) && attr.name !== 'type' && attr.title !== 'File') && (
                  <input
                    type="text"
                    value={attributes[attr.name] || ''}
                    required={!OPTIONAL_REQUIREMENTS.includes(attr.name)}
                    onChange={e =>
                      setAttributes(prev => ({
                        ...prev,
                        [attr.name]: e.target.value,
                      }))
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    placeholder={`Enter ${(attr.title || attr.name).toLowerCase()}...`}
                  />
                )}

                {((attr.type === 'string' || !attr.type) && attr.name === 'type') && (
                  <select
                    value={selectedSource.value}
                    disabled={true}
                    className="mt-1  block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  >
                    <option value="" disabled>Select a source...</option>
                    <option value="sqlite">SQLite (local DB)</option>
                    <option value="duckdb">DuckDB (in-memory/local)</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="snowflake">Snowflake</option>
                    <option value="bigquery">BigQuery</option>
                    <option value="csv">CSV File</option>
                    <option value="xls">Excel File</option>
                  </select>
                )}

                {/* File input */}
                  {attr.type === 'string' && attr.title === 'File' &&(
                    <input
                      type="file"
                      onChange={e => {
                        const file = e.target.files?.[0] || null;
                        setAttributes(prev => ({
                          ...prev,
                          [attr.name]: file,
                        }));
                      }}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    />
                  )}

                {/* Reference input (like model refs) */}
                {attr.$ref && (
                  <input
                    type="text"
                    value={attributes[attr.name] || ''}
                    onChange={e =>
                      setAttributes(prev => ({
                        ...prev,
                        [attr.name]: e.target.value,
                      }))
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    placeholder={`Enter ${(attr.title || attr.name).toLowerCase()}...`}
                  />
                )}

                {/* Array input */}
                {attr.type === 'array' && (
                  <div className="space-y-2">
                    {(attributes[attr.name] || []).map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={e => {
                            const newArray = [...(attributes[attr.name] || [])];
                            newArray[index] = e.target.value;
                            setAttributes(prev => ({
                              ...prev,
                              [attr.name]: newArray,
                            }));
                          }}
                          className="flex-1 border border-gray-300 rounded-md shadow-sm p-2"
                          placeholder={`Enter value...`}
                        />
                        <button
                          onClick={() => {
                            const newArray = [...(attributes[attr.name] || [])];
                            newArray.splice(index, 1);
                            setAttributes(prev => ({
                              ...prev,
                              [attr.name]: newArray,
                            }));
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setAttributes(prev => ({
                          ...prev,
                          [attr.name]: [...(prev[attr.name] || []), ''],
                        }));
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <span>+</span> Add {attr.items?.title || 'Item'}
                    </button>
                  </div>
                )}

                {/* Number input */}
                {attr.type === 'number' && (
                  <input
                    type="number"
                    value={attributes[attr.name] || ''}
                    onChange={e =>
                      setAttributes(prev => ({
                        ...prev,
                        [attr.name]: parseFloat(e.target.value),
                      }))
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  />
                )}

                {/* Boolean input */}
                {attr.type === 'boolean' && (
                  <select
                    value={attributes[attr.name] || false}
                    onChange={e =>
                      setAttributes(prev => ({
                        ...prev,
                        [attr.name]: e.target.value === 'true',
                      }))
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                )}
              </div>
            ))}
            <button
              onClick={handleAttributesSubmit}
              className="w-full bg-[#713B57] text-white py-2 px-4 rounded-lg hover:bg-[#5A2F46]"
            >
              Create {displayName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateObjectModal;
