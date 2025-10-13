import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MdEdit, MdDelete } from 'react-icons/md';

function ExplorerContextMenu({ x, y, onRename, onDelete, onClose, itemName }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleEscape = event => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1"
      style={{
        top: y,
        left: x,
        minWidth: '160px',
      }}
    >
      <button
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
        onClick={e => {
          e.stopPropagation();
          onRename();
          onClose();
        }}
      >
        <MdEdit className="w-4 h-4" />
        Rename
      </button>
      <div className="border-t border-gray-200 my-1" />
      <button
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
        onClick={e => {
          e.stopPropagation();
          onDelete();
          onClose();
        }}
      >
        <MdDelete className="w-4 h-4" />
        Delete
      </button>
    </div>,
    document.body
  );
}

export default ExplorerContextMenu;
