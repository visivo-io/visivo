import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * ContextMenu - Lightweight portal-rendered floating menu used for right-click
 * actions in the schema tree (and elsewhere).
 *
 * Props:
 *   - x, y:    (number) screen coordinates where the menu should appear
 *   - onClose: (function) called when the menu should be dismissed
 *   - children: menu items (typically <button> elements)
 */
const ContextMenu = ({ x, y, onClose, children }) => {
  const menuRef = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    const handleKey = e => {
      if (e.key === 'Escape') onClose?.();
    };

    // Use mousedown so we run before any subsequent click handlers.
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-testid="context-menu"
      style={{ position: 'fixed', top: y, left: x, zIndex: 1000 }}
      className="bg-white rounded-md shadow-lg border border-secondary-200 py-1 min-w-[180px]"
    >
      {children}
    </div>,
    document.body
  );
};

export default ContextMenu;
