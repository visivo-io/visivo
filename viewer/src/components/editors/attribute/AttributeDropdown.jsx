import React from 'react';
import { createPortal } from 'react-dom';
import ObjectPill from '../ObjectPill';

const AttributeDropdown = ({
  showDropdown,
  dropdownPosition,
  dropdownRef,
  filteredChildren,
  selectedIndex,
  onSelect,
}) => {
  if (!showDropdown) return null;

  return createPortal(
    <div
      className="fixed z-50 bg-white border border-primary-100 rounded-lg shadow-lg max-h-60 overflow-auto p-1"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
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