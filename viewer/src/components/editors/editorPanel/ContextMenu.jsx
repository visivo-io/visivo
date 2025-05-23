import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function ContextMenu({ x, y, onDelete, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1"
      style={{
        top: y,
        left: x,
        minWidth: '100px',
      }}
    >
      <button
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
      >
        Delete
      </button>
    </div>,
    document.body
  );
}

export default ContextMenu;
