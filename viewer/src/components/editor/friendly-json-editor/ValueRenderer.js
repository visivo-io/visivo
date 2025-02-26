import React, { useState } from 'react';
import { HiPlus, HiTrash, HiExclamation, HiChevronDown, HiChevronRight } from 'react-icons/hi';
import FieldLabel from './FieldLabel';
import ObjectReferenceSelect from '../ObjectReferenceSelect';
import { getAvailableProperties } from '../../../utils/draft7Validator';

// Common input wrapper component to reduce repetition
const InputWrapper = ({ children, property, hasError, errors, path, suggestion, min, max, pattern }) => (
  <div className="mb-3">
    <FieldLabel property={property} />
    <div className="relative">
      {children}
      {hasError && <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <HiExclamation className="text-red-500 w-5 h-5" title={errors.join('\n')} />
      </div>}
    </div>
    {hasError && <div className="text-xs text-red-500 mt-1">{errors[0]}</div>}
    {!hasError && (min !== undefined || max !== undefined) && 
      <div className="text-xs text-gray-500 mt-1">
        {min !== undefined && max !== undefined ? `Range: ${min} to ${max}` : 
         min !== undefined ? `Min: ${min}` : `Max: ${max}`}
      </div>}
    {!hasError && pattern && <div className="text-xs text-gray-500 mt-1">Pattern: {pattern}</div>}
  </div>
);

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
}) => {
  const [collapsed, setCollapsed] = useState(false);
  
  if (value === null) return <span className="text-gray-400">No value</span>;

  // Get validation errors for this path
  const pathKey = path.join('.');
  const errors = validationErrors[pathKey] || [];
  const hasError = errors.length > 0;

  // Handle top-level references
  if (property?.isTopLevelRef) {
    return (
      <InputWrapper property={property} hasError={hasError} errors={errors}>
        <ObjectReferenceSelect
          value={value}
          onChange={(newValue) => onValueChange(path, newValue)}
          availableObjects={availableObjects[property.type.toLowerCase()] || []}
          type={property.type}
        />
      </InputWrapper>
    );
  }

  // Handle primitive values (boolean, number, string)
  if (typeof value === 'boolean') {
    return (
      <InputWrapper property={property} hasError={hasError} errors={errors}>
        <select 
          className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
          value={value.toString()}
          onChange={(e) => onValueChange(path, e.target.value === 'true')}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </InputWrapper>
    );
  }

  if (typeof value === 'number') {
    return (
      <InputWrapper 
        property={property} 
        hasError={hasError} 
        errors={errors} 
        min={property?.minimum} 
        max={property?.maximum}
      >
        <input
          type="number"
          className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
          value={value}
          onChange={(e) => onValueChange(path, Number(e.target.value))}
          onFocus={() => onInputFocus(path)}
          onBlur={() => onInputBlur(path)}
          min={property?.minimum}
          max={property?.maximum}
          step={property?.type === 'integer' ? 1 : 'any'}
        />
      </InputWrapper>
    );
  }

  if (typeof value === 'string') {
    if (property?.enum) {
      return (
        <InputWrapper property={property} hasError={hasError} errors={errors}>
          <select
            className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
            value={value}
            onChange={(e) => onValueChange(path, e.target.value)}
          >
            <option value="" disabled>Select {property.key}</option>
            {property.enum.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </InputWrapper>
      );
    }

    // Handle string with format or pattern
    const inputType = property?.format === 'email' ? 'email' : 
                      property?.format === 'uri' || property?.format === 'url' ? 'url' :
                      property?.format === 'date' ? 'date' :
                      property?.format === 'time' ? 'time' :
                      property?.format === 'date-time' ? 'datetime-local' :
                      property?.format === 'color' ? 'color' :
                      property?.format === 'password' ? 'password' : 'text';
    
    return (
      <InputWrapper 
        property={property} 
        hasError={hasError} 
        errors={errors} 
        pattern={property?.pattern}
      >
        <input
          type={inputType}
          className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-300' : 'border-gray-200'} bg-white`}
          value={value}
          onChange={(e) => onValueChange(path, e.target.value)}
          onFocus={() => onInputFocus(path)}
          onBlur={() => onInputBlur(path)}
          minLength={property?.minLength}
          maxLength={property?.maxLength}
          pattern={property?.pattern}
          placeholder={property?.format ? `Enter ${property.format} value` : ''}
        />
      </InputWrapper>
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

export default ValueRenderer; 