import React, { useState, useEffect } from 'react';
import renderValue from './renderValue';
import { HiPlus, HiOutlineCollection } from 'react-icons/hi';
import AddItemModal from './AddItemModal';
import useStore from '../../stores/store';
import ContextMenu from './ContextMenu';

function ListComponent({ name, data, path }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const addListItem = useStore(state => state.addListItem);
  const [contextMenu, setContextMenu] = useState(null);
  const deleteNamedChildAttribute = useStore(state => state.deleteNamedChildAttribute);

  const handleAddItem = newItem => {
    addListItem(path, newItem);
    setIsModalOpen(false);
  };

  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDelete = () => {
    console.log('Deleting path:', path);
    deleteNamedChildAttribute(path);
    setContextMenu(null);
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Return null if data is null or undefined
  if (data === null || data === undefined || data.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-white rounded-lg shadow border border-gray-100 my-2" onContextMenu={handleContextMenu}>
      <div className="flex items-center gap-2 mb-2 justify-between">
        <div className="flex items-center gap-2">
          <HiOutlineCollection className="text-secondary-500 w-5 h-5" />
          <div className="text-md font-semibold text-secondary-700 pb-1">{name}</div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-0.5 text-white bg-secondary-400 hover:bg-secondary-500 rounded-full shadow transition-colors focus:ring-2 focus:ring-gray-200 focus:outline-none"
        >
          <HiPlus className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-secondary-100 mb-2" />
      <div className="rounded-md">
        <div className="flex flex-wrap gap-2">
          {data.map((item, index) => {
            const childPath = [...path, index];
            return (
              <div
                key={index}
                className="border border-primary-100 bg-primary-50 pt-2 pb-2 pr-2 rounded-md shadow-sm"
                style={{ minWidth: '30px', maxWidth: '400px', flex: '1 1 auto' }}
              >
                {renderValue(index, item, childPath)}
              </div>
            );
          })}
        </div>
      </div>
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddItem}
        isObjectMode={false}
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

export default ListComponent;
