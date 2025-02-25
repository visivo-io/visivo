import React from 'react';
import { HiPlus, HiTrash, HiExclamation } from 'react-icons/hi';
import FieldLabel from './FieldLabel';
import ObjectReferenceSelect from '../ObjectReferenceSelect';
import { splitDescription } from './utils';

const ValueRenderer = ({
  value,
  path = [],
  isRoot = false,
  property,
  validation = { valid: true, errors: [] },
  availableObjects = {},
  onValueChange,
  onArrayAdd,
  onArrayDelete,
  onObjectAdd,
  onObjectDelete,
  onInputFocus,
  onInputBlur,
  isFocused = false,
}) => {
  if (value === null) return <span className="text-gray-400">No value</span>;

  const { suggestion } = property?.description 
    ? splitDescription(property.description) 
    : { suggestion: '' };

  // Handle top-level references
  if (property?.isTopLevelRef) {
    return (
      <div className="relative mb-4">
        <FieldLabel property={property} />
        <ObjectReferenceSelect
          value={value}
          onChange={(newValue) => onValueChange(path, newValue)}
          availableObjects={availableObjects[property.type.toLowerCase()] || []}
          type={property.type}
        />
      </div>
    );
  }

  // Handle boolean values
  if (typeof value === 'boolean') {
    return (
      <div className="relative mb-4">
        <FieldLabel property={property} />
        <select 
          className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
          value={value.toString()}
          onChange={(e) => onValueChange(path, e.target.value === 'true')}
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

  // Handle number values
  if (typeof value === 'number') {
    return (
      <div className="relative mb-4">
        <FieldLabel property={property} />
        <input
          type="number"
          className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
          value={value}
          onChange={(e) => onValueChange(path, Number(e.target.value))}
          onFocus={() => onInputFocus(path)}
          onBlur={() => onInputBlur(path)}
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

  // Handle string values
  if (typeof value === 'string') {
    if (property?.enum) {
      return (
        <div className="relative mb-4">
          <FieldLabel property={property} />
          <select
            className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
            value={value}
            onChange={(e) => onValueChange(path, e.target.value)}
            title={suggestion}
          >
            <option value="" disabled>Select {property.key}</option>
            {property.enum.map(option => (
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
        <FieldLabel property={property} />
        <input
          type="text"
          className={`w-full px-3 py-2 rounded-lg border ${validation.valid ? 'border-gray-200' : 'border-red-300'} bg-white`}
          value={value}
          onChange={(e) => onValueChange(path, e.target.value)}
          onFocus={() => onInputFocus(path)}
          onBlur={() => onInputBlur(path)}
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

  // Handle array values
  if (Array.isArray(value)) {
    return (
      <div className="pl-4 border-l-2 border-gray-200 mb-4">
        <FieldLabel property={property} />
        {value.map((item, index) => (
          <div key={index} className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500">Item {index + 1}</span>
              <button
                onClick={() => onArrayDelete(path, index)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
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
              isFocused={isFocused}
              availableObjects={availableObjects}
            />
          </div>
        ))}
        <button
          onClick={() => onArrayAdd(path)}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
        >
          <HiPlus className="w-4 h-4" /> Add Item
        </button>
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
            <div key={key} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
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
                isFocused={isFocused}
                availableObjects={availableObjects}
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
    return (
      <div className="pl-4 border-l-2 border-gray-200 mb-4">
        <FieldLabel property={property} />
        {Object.entries(value).map(([key, val]) => (
          <div key={key} className="mb-3">
            <div className="flex items-center justify-between mb-1">
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
                isFocused={isFocused}
                availableObjects={availableObjects}
              />
              {!isRoot && (
                <button
                  onClick={() => onObjectDelete(path, key)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={() => onObjectAdd(path)}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
        >
          <HiPlus className="w-4 h-4" /> Add Property
        </button>
      </div>
    );
  }

  return <span>{String(value)}</span>;
};

export default ValueRenderer; 