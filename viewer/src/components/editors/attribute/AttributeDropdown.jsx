import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ObjectPill from '../ObjectPill';

const AttributeDropdown = ({
  showDropdown,
  anchorRef,
  dropdownRef,
  filteredChildren,
  selectedIndex,
  onSelect,
}) => {
  const [style, setStyle] = useState({});

  useEffect(() => {
    if (showDropdown && anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
        zIndex: 50,
      });
    }
  }, [showDropdown, anchorRef]);

  if (!showDropdown) return null;

  return createPortal(
    <div
      className="bg-white border border-primary-100 rounded-lg shadow-lg max-h-60 overflow-auto p-1"
      style={style}
      ref={dropdownRef}
    >
      {filteredChildren.map((child, index) => (
        <div
          key={child}
          className={`p-1 cursor-pointer rounded-md transition-colors ${
            index === selectedIndex ? 'bg-primary-100 text-primary-700' : 'hover:bg-primary-50'
          }`}
          onClick={() => onSelect(child)}
        >
          <ObjectPill name={child} inline={false} disableDoubleClick={true} />
        </div>
      ))}
    </div>,
    document.body
  );
};

export default AttributeDropdown; 