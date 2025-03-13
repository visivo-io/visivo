import React from 'react';
import renderValue from './renderValue';

function ObjectComponent({ name, data, path }) {
  
  // Filter and sort non-object entries
  const sortedNonObjectEntries = Object.entries(data)
    .filter(([_, value]) => typeof value !== 'object' || value === null)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
  const sortedNonObject = Object.fromEntries(sortedNonObjectEntries);
  // Get the remaining entries (objects)
  const objectEntries = Object.entries(data)
    .filter(([_, value]) => typeof value === 'object' && value !== null)
    .sort(([_, valueA], [__, valueB]) => {
      const keysCountA = Object.keys(valueA).length;
      const keysCountB = Object.keys(valueB).length;
      return keysCountB - keysCountA; // Sort descending (most keys first)
    });
  const sortedObject = Object.fromEntries(objectEntries);
  
  // Combine the sorted non-object entries with object entries
  return (
    <div className="flex flex-col rounded-md gap-1">
      {name && isNaN(parseInt(name)) && typeof name === 'string' && (
        <div className="text-md font-medium text-yellow-800">{name}</div>
      )}
      
      
      {/* Non-Object Section */}
      {Object.keys(sortedNonObject).length > 0 && (
        <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto w-full">
            {Object.entries(sortedNonObject).map(([key, value]) => {
            if (key === 'changed' || key === 'path' || key === 'name' || key === '__v') return null;
            const childPath = [...path, key];
            return (
                <div
                key={key}
                className="border-gray-200 border bg-red-50 p-3 rounded-md text-" 
                style={{ minWidth: '30px', maxWidth: '400px', flex: '1 0 auto' }}
                >
                {renderValue(key, value, childPath)}
                </div>
            );
            })}
        </div>
       )}

      {/* Object Section */}
      {Object.keys(sortedObject).length > 0 && (
        <div className="flex flex-wrap gap-4 w-full">
            {objectEntries.map(([key, value]) => {
            if (key === 'changed' || key === 'path' || key === 'name' || key === '__v') return null;
            const childPath = [...path, key];
            // Estimate size based on number of keys (simplified)
            const keyCount = Object.keys(value).length;
            const sizeFactor = Math.min(Math.max(keyCount * 270, 400), 1200); // Example: 200px to 400px
            return (
                <div
                key={key}
                className="border-gray-400 border bg-blue-50 p-4 rounded-lg  shadow"
                style={{ width: `${sizeFactor}px`, minWidth: '200px' }}
                >
                {renderValue(key, value, childPath)}
                </div>
            );
            })}
        </div>
        )}
    </div>
  );
}
  
export default ObjectComponent;