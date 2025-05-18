import React, { useState, useEffect } from 'react';
import renderValue from './renderValue';
import { HiPlus, HiOutlineCube } from 'react-icons/hi';
import AddItemModal from '../modals/AddItemModal';
import useStore from '../../../../stores/store';
import ContextMenu from '../ContextMenu';

function ObjectComponent({ name, data, path }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const addObjectProperty = useStore(state => state.addObjectProperty);
  const [contextMenu, setContextMenu] = useState(null);
  const deleteNamedChildAttribute = useStore(state => state.deleteNamedChildAttribute);

  const handleAddProperty = ({ name: propertyName, value }) => {
    addObjectProperty(path, propertyName, value);
    setIsModalOpen(false);
  };

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

  // Update the handler to match AttributeComponent
  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation(); // Add this to prevent event bubbling
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDelete = () => {
    console.log('Deleting path:', path); // Debug log
    deleteNamedChildAttribute(path);
    setContextMenu(null);
  };

  // Add useEffect for clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  const label = name ? name : data.name;

  return (
    <div className="flex flex-col  p-2 bg-white rounded-lg border-primary-100 bg-primary-50 shadow border border-gray-100 mt-2" onContextMenu={handleContextMenu}>
      <div className="flex items-center  justify-between">
        <div className="flex items-center gap-2">
          <HiOutlineCube className="text-primary-500 w-5 h-5 " />
          <div className="text-md font-semibold text-primary-500 pb-1">{label}</div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-0.5 text-white bg-primary-500 hover:bg-primary-600 rounded-full shadow transition-colors focus:ring-2 focus:ring-primary-200 focus:outline-none"
          
        >
          <HiPlus className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-primary-100 mb-2" />
      {/* Non-Object Section */}
      {Object.keys(sortedNonObject).length > 0 && (
        <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto w-full">
          {Object.entries(sortedNonObject).map(([key, value]) => {
            if (key === 'changed' || key === 'path' || key === 'name' || key === '__v') return null;
            const childPath = [...path, key];
            return (
              <div key={key} className="flex-1 min-w-[200px]">
                {renderValue(key, value, childPath)}
              </div>
            );
          })}
        </div>
      )}
      {/* Object Section */}
      {Object.keys(sortedObject).length > 0 && (
        <div className="flex flex-wrap gap-2 w-full">
          {objectEntries.map(([key, value]) => {
            if (key === 'changed' || key === 'path' || key === 'name' || key === '__v') return null;
            const childPath = [...path, key];
            const keyCount = Object.keys(value).length;
            const sizeFactor = Math.min(Math.max(keyCount * 270, 400), 1200);
            return (
              <div
                key={key}
                
                style={{ width: `${sizeFactor}px`, minWidth: '200px' }}
              >
                {renderValue(key, value, childPath)}
              </div>
            );
          })}
        </div>
      )}
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddProperty}
        isObjectMode={true}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default ObjectComponent;
