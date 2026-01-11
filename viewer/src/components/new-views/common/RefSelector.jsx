import React, { useMemo } from 'react';
import useStore from '../../../stores/store';
import { getTypeByValue, DEFAULT_COLORS } from './objectTypeConfigs';

/**
 * Extract name from a ref string: ${ref(name)} or ref(name) -> name
 * Also handles raw names (returns as-is)
 */
const parseRefValue = value => {
  if (!value) return null;
  if (typeof value !== 'string') return null;

  // Match ${ref(name)} pattern (context string format - preferred)
  const contextRefMatch = value.match(/^\$\{ref\(\s*([^)]+)\s*\)\}$/);
  if (contextRefMatch) {
    return contextRefMatch[1].trim();
  }

  // Match ref(name) pattern (legacy format)
  const refMatch = value.match(/^ref\(\s*([^)]+)\s*\)$/);
  if (refMatch) {
    return refMatch[1].trim();
  }

  // Return as-is if not a ref format (could be raw name)
  return value;
};

/**
 * Format a name as ${ref(name)} (context string format)
 */
const formatRefValue = name => {
  if (!name) return null;
  return `\${ref(${name})}`;
};

/**
 * Parse multiple ref values (for multi-select)
 * Input can be: array of refs, comma-separated string, or single ref
 */
const parseMultiRefValue = value => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(parseRefValue).filter(Boolean);
  }
  if (typeof value === 'string') {
    // Could be comma-separated or single value
    return value
      .split(',')
      .map(v => parseRefValue(v.trim()))
      .filter(Boolean);
  }
  return [];
};

/**
 * Format multiple names as array of refs
 */
const formatMultiRefValue = names => {
  if (!names || names.length === 0) return null;
  return names.map(formatRefValue);
};

/**
 * Map object type to store selector and data accessor
 */
const getObjectsForType = (objectType, store) => {
  switch (objectType) {
    case 'source':
      return store.sources || [];
    case 'model':
      return store.models || [];
    default:
      return [];
  }
};

/**
 * RefSelector - Reusable dropdown for selecting object references
 *
 * Handles the ref() format automatically:
 * - Parses incoming values like ref(source_name) to extract names
 * - Serializes selected names back to ref(name) format
 *
 * Props:
 * - value: Current value (ref string, array of refs, or raw names)
 * - onChange: Callback with serialized ref value(s)
 * - objectType: Type of objects to select from ('source', 'model', etc.)
 * - multiple: Whether to allow multiple selections (default: false)
 * - disabled: Whether the selector is disabled
 * - label: Optional label text
 * - placeholder: Placeholder text when nothing selected
 * - helperText: Optional helper text shown below the selector
 * - required: Whether selection is required
 */
const RefSelector = ({
  value,
  onChange,
  objectType,
  multiple = false,
  disabled = false,
  label,
  placeholder,
  helperText,
  required = false,
}) => {
  // Get type configuration for styling
  const typeConfig = getTypeByValue(objectType);
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const TypeIcon = typeConfig?.icon;
  const singularLabel = typeConfig?.singularLabel || objectType;
  const pluralLabel = typeConfig?.label || `${objectType}s`;

  // Get objects from store
  const objects = useStore(state => getObjectsForType(objectType, state));

  // Parse current value to get selected name(s)
  const selectedValues = useMemo(() => {
    if (multiple) {
      return parseMultiRefValue(value);
    }
    const parsed = parseRefValue(value);
    return parsed ? [parsed] : [];
  }, [value, multiple]);

  // Default placeholder based on type and mode
  const defaultPlaceholder = multiple
    ? `Select ${pluralLabel.toLowerCase()}...`
    : `Select a ${singularLabel.toLowerCase()}...`;

  // Handle single select change
  const handleSingleChange = e => {
    const selected = e.target.value;
    if (selected === '') {
      onChange(null);
    } else {
      onChange(formatRefValue(selected));
    }
  };

  // Handle checkbox toggle (for multi-select with checkboxes)
  const handleCheckboxToggle = name => {
    const newSelection = selectedValues.includes(name)
      ? selectedValues.filter(v => v !== name)
      : [...selectedValues, name];

    if (newSelection.length === 0) {
      onChange(null);
    } else {
      onChange(formatMultiRefValue(newSelection));
    }
  };

  // Render multi-select as checkbox list (better UX than native multi-select)
  if (multiple) {
    return (
      <div className="space-y-2">
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}

        <div
          className={`
            border border-gray-300 rounded-md
            max-h-48 overflow-y-auto
            ${disabled ? 'bg-gray-100' : 'bg-white'}
          `}
        >
          {objects.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 italic">
              No {pluralLabel.toLowerCase()} available
            </div>
          ) : (
            objects.map(obj => (
              <label
                key={obj.name}
                className={`
                  flex items-center gap-2 px-3 py-2
                  hover:bg-gray-50 cursor-pointer
                  border-b border-gray-100 last:border-b-0
                  ${disabled ? 'cursor-not-allowed opacity-50' : ''}
                `}
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(obj.name)}
                  onChange={() => handleCheckboxToggle(obj.name)}
                  disabled={disabled}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {TypeIcon && <TypeIcon fontSize="small" className={colors.text} />}
                  <span className="text-sm text-gray-900 truncate">{obj.name}</span>
                  {obj.type && <span className="text-xs text-gray-500">({obj.type})</span>}
                </div>
              </label>
            ))
          )}
        </div>

        {selectedValues.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedValues.map(name => (
              <span
                key={name}
                className={`
                  inline-flex items-center gap-1 px-2 py-0.5
                  text-xs font-medium rounded-full
                  ${colors.bg} ${colors.text}
                `}
              >
                {name}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleCheckboxToggle(name)}
                    className="hover:text-gray-900"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {helperText && <p className="text-xs text-gray-500">{helperText}</p>}
      </div>
    );
  }

  // Single select - standard dropdown
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        <select
          value={selectedValues[0] || ''}
          onChange={handleSingleChange}
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
          <option value="">{placeholder || defaultPlaceholder}</option>
          {objects.map(obj => (
            <option key={obj.name} value={obj.name}>
              {obj.name} {obj.type ? `(${obj.type})` : ''}
            </option>
          ))}
        </select>

        {/* Icon on the left */}
        {TypeIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <TypeIcon fontSize="small" className={colors.text} />
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

      {helperText && !selectedValues[0] && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  );
};

export default RefSelector;

// Export utility functions for external use
export { parseRefValue, formatRefValue, parseMultiRefValue, formatMultiRefValue };
