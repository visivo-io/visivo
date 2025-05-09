import React, { useState, useEffect } from 'react';
import renderValue from './renderValue';
import { HiPlus } from 'react-icons/hi';
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
    <div className="flex flex-col p-1" onContextMenu={handleContextMenu}>
      <div className="flex justify-between items-center">
        {name && isNaN(parseInt(name)) && typeof name === 'string' && (
          <div className="text-md font-medium text-purple-600">{name}</div>
        )}
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-1 text-purple-600 hover:text-purple-800 rounded-full hover:bg-purple-100"
        >
          <HiPlus className="h-5 w-5" />
        </button>
      </div>

      <div className="rounded-md">
        <div className="flex flex-wrap gap-2">
          {data.map((item, index) => {
            const childPath = [...path, index];
            return (
              <div
                key={index}
                className="border-gray-200 border bg-purple-50 pt-2 pb-2 pr-2 rounded-md"
                style={{
                  minWidth: '30px',
                  maxWidth: '400px',
                  flex: '1 1 auto',
                }}
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
