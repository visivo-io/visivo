import React from 'react';
import { HiInformationCircle } from 'react-icons/hi';
import { formatKey, splitDescription } from './utils';

const FieldLabel = ({ property, fieldKey }) => {
  if (!property && !fieldKey) return null;
  
  // Use property if provided, otherwise use fieldKey
  const key = property?.key || fieldKey;
  const type = property?.type;
  const format = property?.format;
  const required = property?.required;
  const { explanation } = property?.description 
    ? splitDescription(property.description) 
    : { explanation: '' };
  
  return (
    <div className="flex items-center mb-1">
      <label className="text-xs font-medium text-gray-700">
        {formatKey(key)}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {type && (
        <span className="ml-2 text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
          {format ? `${type}:${format}` : type}
        </span>
      )}
      
      {explanation && (
        <HiInformationCircle 
          className="w-4 h-4 text-gray-400 ml-1" 
          title={explanation}
        />
      )}
    </div>
  );
};

export default FieldLabel; 