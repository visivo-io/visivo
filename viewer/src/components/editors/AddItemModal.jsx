import React, { useState } from 'react';
import { Label, TextInput, Select } from 'flowbite-react';
import { HiPlus } from 'react-icons/hi';

const ITEM_TYPES = {
  ATTRIBUTE: 'attribute',
  LIST: 'list',
  OBJECT: 'object'
};

function AddItemModal({ isOpen, onClose, onAdd, isObjectMode }) {
  const [itemType, setItemType] = useState(ITEM_TYPES.ATTRIBUTE);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let processedValue = value;
    
    // Process value based on type
    switch (itemType) {
      case ITEM_TYPES.LIST:
        processedValue = [];
        break;
      case ITEM_TYPES.OBJECT:
        processedValue = {};
        break;
      case ITEM_TYPES.ATTRIBUTE:
        // Try to parse as number if possible
        if (!isNaN(value)) {
          processedValue = Number(value);
        }
        break;
    }

    onAdd(isObjectMode ? { name, value: processedValue, type: itemType } : processedValue);
    handleReset();
  };

  const handleReset = () => {
    setItemType(ITEM_TYPES.ATTRIBUTE);
    setName('');
    setValue('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-[750px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Add New {isObjectMode ? 'Property' : 'Item'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Type
            </label>
            <select
              id="type"
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#713B57] focus:border-[#713B57]"
            >
              <option value={ITEM_TYPES.ATTRIBUTE}>Attribute</option>
              <option value={ITEM_TYPES.LIST}>List</option>
              <option value={ITEM_TYPES.OBJECT}>Object</option>
            </select>
          </div>

          {isObjectMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Property Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#713B57] focus:border-[#713B57]"
                placeholder="Enter property name..."
              />
            </div>
          )}

          {itemType === ITEM_TYPES.ATTRIBUTE && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Value
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#713B57] focus:border-[#713B57]"
                placeholder="Enter value..."
              />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46]"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddItemModal; 