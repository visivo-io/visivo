import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from './objectTypes';

/**
 * SourceSelector - Dropdown for selecting an existing source
 *
 * Props:
 * - value: Current selected source name (string or null)
 * - onChange: Callback when selection changes (receives source name or null)
 * - sources: Array of available sources from store
 * - disabled: Whether the selector is disabled
 * - label: Optional label text
 */
const SourceSelector = ({ value, onChange, sources = [], disabled = false, label = 'Source' }) => {
  const sourceType = getTypeByValue('source');
  const colors = sourceType?.colors || DEFAULT_COLORS;
  const SourceIcon = sourceType?.icon;

  const handleChange = e => {
    const selected = e.target.value;
    onChange(selected === '' ? null : selected);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value || ''}
          onChange={handleChange}
          disabled={disabled}
          className={`
            block w-full pl-10 pr-10 py-2 text-sm
            border border-gray-300 rounded-md
            bg-white
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            disabled:bg-gray-100 disabled:cursor-not-allowed
            appearance-none cursor-pointer
          `}
        >
          <option value="">No source (use default)</option>
          {sources.map(source => (
            <option key={source.name} value={source.name}>
              {source.name} {source.type ? `(${source.type})` : ''}
            </option>
          ))}
        </select>

        {/* Icon on the left */}
        {SourceIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SourceIcon fontSize="small" className={colors.text} />
          </div>
        )}

        {/* Dropdown arrow on the right */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <svg
            className="h-4 w-4 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {/* Helper text */}
      {!value && (
        <p className="text-xs text-gray-500">
          Select a source to run the SQL query against, or leave empty to use the default source.
        </p>
      )}
    </div>
  );
};

export default SourceSelector;
