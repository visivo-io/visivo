import React from 'react';
import { HiInformationCircle } from 'react-icons/hi';
import { formatKey, splitDescription } from './utils';

const FieldLabel = ({ property, fieldKey }) => {
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
  if (fieldKey) {
    return (
      <label className="text-xs font-medium text-gray-700 mb-1 block">
        {formatKey(fieldKey)}
      </label>
    );
  }
  
  return null;
};

export default FieldLabel; 