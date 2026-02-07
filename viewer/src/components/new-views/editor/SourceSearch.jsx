import React from 'react';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

/**
 * SourceSearch - Search input for filtering sources
 * Used by EditorNew view
 */
const SourceSearch = ({ value, onChange, placeholder = 'Search sources...' }) => {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <SearchIcon fontSize="small" className="text-gray-400" />
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
            e.target.blur(); // Remove focus after clearing
          }
        }}
        placeholder={placeholder}
        className="
          block w-full pl-10 pr-10 py-2
          text-sm text-gray-900
          bg-white border border-gray-300 rounded-md
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
          placeholder-gray-400
        "
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
        >
          <ClearIcon fontSize="small" />
        </button>
      )}
    </div>
  );
};

export default SourceSearch;
