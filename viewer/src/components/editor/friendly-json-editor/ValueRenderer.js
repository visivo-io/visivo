import React, { useState } from 'react';
import { HiPlus, HiTrash, HiExclamation, HiChevronDown, HiChevronRight, HiInformationCircle } from 'react-icons/hi';
import FieldLabel from './FieldLabel';
import ObjectReferenceSelect from '../ObjectReferenceSelect';
import { splitDescription } from './utils';
import { getAvailableProperties } from '../../../utils/draft7Validator';

const ValueRenderer = ({
  value,
  path = [],
  isRoot = false,
  property,
  schema,
  objectType,
  validationErrors = {},
  availableObjects = {},
  onValueChange,
  onArrayAdd,
  onArrayDelete,
  onObjectAdd,
  onObjectDelete,
  onInputFocus,
  onInputBlur,
  focusedInputs = {},
}) => {
  const [collapsed, setCollapsed] = useState(false);
  
  if (value === null) return <span className="text-gray-400">No value</span>;

  // Get validation errors for this path
  const pathKey = path.join('.');
  const errors = validationErrors[pathKey] || [];
  const hasError = errors.length > 0;

  // Get property description and suggestion
  const { suggestion, explanation } = property?.description 
    ? splitDescription(property.description) 
    : { suggestion: '', explanation: '' };

  // Handle top-level references
  if (property?.isTopLevelRef) {
    return (
      <div className="relative mb-4">
        <FieldLabel property={property} />
        <div className={`relative ${hasError ? 'border-red-300' : ''}`}>
          <ObjectReferenceSelect
            value={value}
            onChange={(newValue) => onValueChange(path, newValue)}
            availableObjects={availableObjects[property.type.toLowerCase()] || []}
            type={property.type}
          />
          {hasError && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <HiExclamation 
                className="text-red-500 w-5 h-5" 
                title={errors.join('\n')}
              />
            </div>
          )}
        </div>
        {hasError && (
          <div className="text-xs text-red-500 mt-1">{errors[0]}</div>
        )}
      </div>
    );
  }

  // Handle boolean values
  if (typeof value === 'boolean') {
    return (
      <div className="relative mb-4">
        <FieldLabel property={property} />
        <div className="relative">
          <select 
            className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
            value={value.toString()}
            onChange={(e) => onValueChange(path, e.target.value === 'true')}
            title={suggestion}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
          {hasError && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <HiExclamation 
                className="text-red-500 w-5 h-5" 
                title={errors.join('\n')}
              />
            </div>
          )}
        </div>
        {hasError && (
          <div className="text-xs text-red-500 mt-1">{errors[0]}</div>
        )}
      </div>
    );
  }

  // Handle number values
  if (typeof value === 'number') {
    return (
      <div className="relative mb-4">
        <FieldLabel property={property} />
        <div className="relative">
          <input
            type="number"
            className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
            value={value}
            onChange={(e) => onValueChange(path, Number(e.target.value))}
            onFocus={() => onInputFocus(path)}
            onBlur={() => onInputBlur(path)}
            title={suggestion}
            min={property?.minimum}
            max={property?.maximum}
            step={property?.type === 'integer' ? 1 : 'any'}
          />
          {hasError && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <HiExclamation 
                className="text-red-500 w-5 h-5" 
                title={errors.join('\n')}
              />
            </div>
          )}
        </div>
        {hasError && (
          <div className="text-xs text-red-500 mt-1">{errors[0]}</div>
        )}
        {(property?.minimum !== undefined || property?.maximum !== undefined) && !hasError && (
          <div className="text-xs text-gray-500 mt-1">
            {property.minimum !== undefined && property.maximum !== undefined
              ? `Range: ${property.minimum} to ${property.maximum}`
              : property.minimum !== undefined
                ? `Min: ${property.minimum}`
                : `Max: ${property.maximum}`
            }
          </div>
        )}
      </div>
    );
  }

  // Handle string values
  if (typeof value === 'string') {
    if (property?.enum) {
      return (
        <div className="relative mb-4">
          <FieldLabel property={property} />
          <div className="relative">
            <select
              className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
              value={value}
              onChange={(e) => onValueChange(path, e.target.value)}
              title={suggestion}
            >
              <option value="" disabled>Select {property.key}</option>
              {property.enum.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {hasError && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <HiExclamation 
                  className="text-red-500 w-5 h-5" 
                  title={errors.join('\n')}
                />
              </div>
            )}
          </div>
          {hasError && (
            <div className="text-xs text-red-500 mt-1">{errors[0]}</div>
          )}
        </div>
      );
    }

    // Handle string with format
    if (property?.format) {
      const inputType = getInputTypeFromFormat(property.format);
      
      return (
        <div className="relative mb-4">
          <FieldLabel property={property} />
          <div className="relative">
            <input
              type={inputType}
              className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
              value={value}
              onChange={(e) => onValueChange(path, e.target.value)}
              onFocus={() => onInputFocus(path)}
              onBlur={() => onInputBlur(path)}
              title={suggestion}
              minLength={property?.minLength}
              maxLength={property?.maxLength}
              placeholder={`Enter ${property?.format} value`}
            />
            {hasError && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <HiExclamation 
                  className="text-red-500 w-5 h-5" 
                  title={errors.join('\n')}
                />
              </div>
            )}
          </div>
          {hasError && (
            <div className="text-xs text-red-500 mt-1">{errors[0]}</div>
          )}
          {!hasError && (
            <div className="text-xs text-gray-500 mt-1">
              Format: {property.format}
              {property.pattern && <span> (Pattern: {property.pattern})</span>}
            </div>
          )}
        </div>
      );
    }

    // Regular string input
    return (
      <div className="relative mb-4">
        <FieldLabel property={property} />
        <div className="relative">
          <input
            type="text"
            className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
            value={value}
            onChange={(e) => onValueChange(path, e.target.value)}
            onFocus={() => onInputFocus(path)}
            onBlur={() => onInputBlur(path)}
            title={suggestion}
            minLength={property?.minLength}
            maxLength={property?.maxLength}
            pattern={property?.pattern}
          />
          {hasError && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <HiExclamation 
                className="text-red-500 w-5 h-5" 
                title={errors.join('\n')}
              />
            </div>
          )}
        </div>
        {hasError && (
          <div className="text-xs text-red-500 mt-1">{errors[0]}</div>
        )}
        {property?.pattern && !hasError && (
          <div className="text-xs text-gray-500 mt-1">
            Pattern: {property.pattern}
          </div>
        )}
      </div>
    );
  }

  // Handle array values
  if (Array.isArray(value)) {
    return (
      <div className="pl-4 border-l-2 border-gray-200 mb-4">
        <div className="flex items-center mb-2">
          <button 
            onClick={() => setCollapsed(!collapsed)} 
            className="mr-2 text-gray-500 hover:text-gray-700"
          >
            {collapsed ? <HiChevronRight className="w-4 h-4" /> : <HiChevronDown className="w-4 h-4" />}
          </button>
          <FieldLabel property={property} />
          <span className="text-xs text-gray-500 ml-2">({value.length} items)</span>
        </div>
        
        {!collapsed && (
          <>
            {value.map((item, index) => (
              <div key={index} className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">Item {index + 1}</span>
                  <button
                    onClick={() => onArrayDelete(path, index)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    title="Delete item"
                  >
                    <HiTrash className="w-4 h-4" />
                  </button>
                </div>
                <ValueRenderer
                  value={item}
                  path={[...path, index]}
                  onValueChange={onValueChange}
                  onArrayAdd={onArrayAdd}
                  onArrayDelete={onArrayDelete}
                  onObjectAdd={onObjectAdd}
                  onObjectDelete={onObjectDelete}
                  onInputFocus={onInputFocus}
                  onInputBlur={onInputBlur}
                  focusedInputs={focusedInputs}
                  validationErrors={validationErrors}
                  availableObjects={availableObjects}
                  schema={schema}
                  objectType={objectType}
                />
              </div>
            ))}
            <button
              onClick={() => onArrayAdd(path)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
            >
              <HiPlus className="w-4 h-4" /> Add Item
            </button>
          </>
        )}
      </div>
    );
  }

  // Handle object values
  if (typeof value === 'object') {
    // For top-level objects, render as cards in a grid
    if (isRoot) {
      const filteredEntries = Object.entries(value).filter(([key]) => 
        !['path', 'name', 'changed'].includes(key.toLowerCase())
      );
      
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntries.map(([key, val]) => (
            <div key={key} className={`bg-white rounded-lg border ${validationErrors[key] ? 'border-red-300' : 'border-gray-200'} shadow-sm p-4`}>
              <ValueRenderer
                value={val}
                path={[...path, key]}
                property={{ key }}
                onValueChange={onValueChange}
                onArrayAdd={onArrayAdd}
                onArrayDelete={onArrayDelete}
                onObjectAdd={onObjectAdd}
                onObjectDelete={onObjectDelete}
                onInputFocus={onInputFocus}
                onInputBlur={onInputBlur}
                focusedInputs={focusedInputs}
                validationErrors={validationErrors}
                availableObjects={availableObjects}
                schema={schema}
                objectType={objectType}
              />
            </div>
          ))}
          <div className="bg-white rounded-lg border border-dashed border-gray-300 p-4 flex items-center justify-center">
            <button
              onClick={() => onObjectAdd(path)}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <HiPlus className="w-5 h-5" /> Add Property
            </button>
          </div>
        </div>
      );
    }
    
    // For nested objects
    const properties = schema && objectType ? 
      getAvailableProperties(schema, objectType, path, value) : [];
    
    return (
      <div className="pl-4 border-l-2 border-gray-200 mb-4">
        <div className="flex items-center mb-2">
          <button 
            onClick={() => setCollapsed(!collapsed)} 
            className="mr-2 text-gray-500 hover:text-gray-700"
          >
            {collapsed ? <HiChevronRight className="w-4 h-4" /> : <HiChevronDown className="w-4 h-4" />}
          </button>
          <FieldLabel property={property} />
          <span className="text-xs text-gray-500 ml-2">
            ({Object.keys(value).length} properties)
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
        
        {!collapsed && (
          <>
            {Object.entries(value).map(([key, val]) => {
              const propDef = properties.find(p => p.key === key);
              return (
                <div key={key} className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <ValueRenderer
                      value={val}
                      path={[...path, key]}
                      property={propDef || { key }}
                      onValueChange={onValueChange}
                      onArrayAdd={onArrayAdd}
                      onArrayDelete={onArrayDelete}
                      onObjectAdd={onObjectAdd}
                      onObjectDelete={onObjectDelete}
                      onInputFocus={onInputFocus}
                      onInputBlur={onInputBlur}
                      focusedInputs={focusedInputs}
                      validationErrors={validationErrors}
                      availableObjects={availableObjects}
                      schema={schema}
                      objectType={objectType}
                    />
                    {!propDef?.required && (
                      <button
                        onClick={() => onObjectDelete(path, key)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded self-start mt-1"
                        title="Delete property"
                      >
                        <HiTrash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => onObjectAdd(path)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
            >
              <HiPlus className="w-4 h-4" /> Add Property
            </button>
          </>
        )}
      </div>
    );
  }

  return <div className="text-gray-500">Unsupported value type</div>;
};

// Helper function to determine input type from format
const getInputTypeFromFormat = (format) => {
  switch (format) {
    case 'email':
      return 'email';
    case 'uri':
    case 'url':
      return 'url';
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'date-time':
      return 'datetime-local';
    case 'color':
      return 'color';
    case 'password':
      return 'password';
    default:
      return 'text';
  }
};

export default ValueRenderer; 