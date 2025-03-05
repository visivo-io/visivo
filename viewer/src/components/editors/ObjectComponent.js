import React from 'react';
import renderValue from './renderValue';

function ObjectComponent({ name, data, path }) {
  return (
    <div className="flex flex-col gap-4">
      {name && isNaN(parseInt(name)) && (
        <div className="text-lg font-medium text-gray-800">{name}</div>
      )}
      <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-sm">    
        {Object.entries(data).map(([key, value]) => {
          // Skip internal properties or complex objects that shouldn't be edited directly
          if (key === 'path' || key === 'name' || key === '__v') {
            return (
              <div key={key} className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-500">{key}:</span>
                <span className="text-sm text-gray-700">{String(value)}</span>
              </div>
            );
          }
          
          const childPath = [...path, key];
          return (
            <div key={key} className="mb-3">
              {renderValue(key, value, childPath)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
  
export default ObjectComponent;