import React, { useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { getEnabledTypes } from './objectTypes';

/**
 * CreateButton - Floating action button with object type menu
 * Used by both LineageNew and EditorNew views
 */
const CreateButton = ({ objectTypes = getEnabledTypes(), onSelect }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleSelect = objectType => {
    setIsMenuOpen(false);
    onSelect && onSelect(objectType);
  };

  return (
    <div className="absolute bottom-6 right-6 z-10">
      {/* Object type menu (appears above FAB when open) */}
      {isMenuOpen && (
        <div className="absolute bottom-16 right-0 mb-2 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-40">
          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            Create New
          </div>
          {objectTypes.map(type => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                onClick={() => handleSelect(type.value)}
                className="
                  w-full text-left px-4 py-2.5 text-sm text-gray-700
                  hover:bg-gray-50 transition-colors
                  flex items-center gap-2
                "
              >
                <Icon fontSize="small" className="text-gray-500" />
                {type.singularLabel || type.label}
              </button>
            );
          })}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`
          w-14 h-14 rounded-full
          ${isMenuOpen ? 'bg-gray-600 hover:bg-gray-700' : 'bg-primary-500 hover:bg-primary-600'}
          text-white shadow-lg
          flex items-center justify-center
          transition-all duration-200
          hover:scale-105
        `}
        title={isMenuOpen ? 'Close menu' : 'Create new object'}
      >
        {isMenuOpen ? <CloseIcon /> : <AddIcon />}
      </button>
    </div>
  );
};

export default CreateButton;
