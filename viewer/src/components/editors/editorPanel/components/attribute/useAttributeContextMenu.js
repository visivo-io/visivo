import { useState, useEffect } from 'react';

export const useAttributeContextMenu = onDelete => {
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDelete = () => {
    onDelete();
    setContextMenu(null);
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleDelete,
  };
};
