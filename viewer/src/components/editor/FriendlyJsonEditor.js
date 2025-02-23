import React from 'react';
import { HiPlus, HiTrash, HiPencil } from 'react-icons/hi';

const FriendlyJsonEditor = ({ data, onChange }) => {
  const renderValue = (value, path = [], isRoot = false) => {
    if (value === null) return <span className="text-gray-400">No value</span>;

    if (typeof value === 'boolean') {
      return (
        <select 
          className="px-2 py-1 rounded border border-gray-200 bg-white"
          value={value.toString()}
          onChange={(e) => handleValueChange(path, e.target.value === 'true')}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    if (typeof value === 'number') {
      return (
        <input
          type="number"
          className="px-2 py-1 rounded border border-gray-200 bg-white"
          value={value}
          onChange={(e) => handleValueChange(path, Number(e.target.value))}
        />
      );
    }

    if (typeof value === 'string') {
      return (
        <input
          type="text"
          className="px-2 py-1 rounded border border-gray-200 bg-white w-full"
          value={value}
          onChange={(e) => handleValueChange(path, e.target.value)}
        />
      );
    }

    if (Array.isArray(value)) {
      return (
        <div className="pl-4 border-l-2 border-gray-200">
          {value.map((item, index) => (
            <div key={index} className="mb-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">Item {index + 1}</span>
                <button
                  onClick={() => handleArrayDelete(path, index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              </div>
              {renderValue(item, [...path, index])}
            </div>
          ))}
          <button
            onClick={() => handleArrayAdd(path)}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
          >
            <HiPlus className="w-4 h-4" /> Add Item
          </button>
        </div>
      );
    }

    if (typeof value === 'object') {
      return (
        <div className={isRoot ? '' : 'pl-4 border-l-2 border-gray-200'}>
          {Object.entries(value).map(([key, val]) => (
            <div key={key} className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex items-center gap-2 flex-1">
                  <span className="font-medium text-gray-700">{formatKey(key)}</span>
                  <button
                    onClick={() => handleKeyEdit(path, key)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <HiPencil className="w-3 h-3" />
                  </button>
                </div>
                {!isRoot && (
                  <button
                    onClick={() => handleObjectDelete(path, key)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <HiTrash className="w-4 h-4" />
                  </button>
                )}
              </div>
              {renderValue(val, [...path, key])}
            </div>
          ))}
          <button
            onClick={() => handleObjectAdd(path)}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm mt-2"
          >
            <HiPlus className="w-4 h-4" /> Add Property
          </button>
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  const formatKey = (key) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleValueChange = (path, newValue) => {
    const newData = { ...data };
    let current = newData;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = newValue;
    onChange(newData);
  };

  const handleArrayAdd = (path) => {
    const newData = { ...data };
    let current = newData;
    for (const key of path) {
      current = current[key];
    }
    current.push('');
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
    const newData = { ...data };
    let current = newData;
    for (const key of path) {
      current = current[key];
    }
    const newKey = 'new_property';
    current[newKey] = '';
    onChange(newData);
  };

  const handleObjectDelete = (path, key) => {
    const newData = { ...data };
    let current = newData;
    for (const p of path) {
      current = current[p];
    }
    delete current[key];
    onChange(newData);
  };

  const handleKeyEdit = (path, oldKey) => {
    const newKey = prompt('Enter new property name:', oldKey);
    if (newKey && newKey !== oldKey) {
      const newData = { ...data };
      let current = newData;
      for (const p of path) {
        current = current[p];
      }
      current[newKey] = current[oldKey];
      delete current[oldKey];
      onChange(newData);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg">
      {renderValue(data, [], true)}
    </div>
  );
};

export default FriendlyJsonEditor; 