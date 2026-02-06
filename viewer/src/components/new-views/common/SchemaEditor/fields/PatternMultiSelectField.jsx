import React, { useMemo, useCallback } from 'react';
import { FormHelperText } from '@mui/material';
import {
  parsePatternValue,
  serializePatternValue,
  isEnumValue,
  extractPatternOptions,
} from '../utils/patternUtils';

/**
 * Pattern-based multi-select field component
 * Handles schemas with pattern-based combinations (e.g., "lines+markers")
 * and optional single enum values (e.g., "none")
 *
 * Schema pattern:
 * {
 *   "oneOf": [
 *     {
 *       "type": "string",
 *       "pattern": "^(lines|markers|text)(\\+(lines|markers|text))*$"
 *     },
 *     {
 *       "enum": ["none", "skip"]  // Optional
 *     },
 *     {
 *       "$ref": "#/$defs/query-string"
 *     }
 *   ]
 * }
 *
 * @param {object} props
 * @param {string} props.value - Current value (e.g., "lines+markers" or "none")
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function PatternMultiSelectField({
  value,
  onChange,
  schema,
  defs = {},
  label,
  description,
  disabled = false,
}) {
  // Extract pattern and enum options from schema (memoized)
  const { patternOptions, enumOptions } = useMemo(() => {
    if (!schema) return { patternOptions: [], enumOptions: [] };

    // Parse original schema (don't use getStaticSchema as it collapses oneOf)
    const findOptions = (schemaToCheck) => {
      const options = schemaToCheck.oneOf || schemaToCheck.anyOf;
      if (!options) return { patternOptions: [], enumOptions: [] };

      let patternOptions = [];
      let enumOptions = [];

      for (const opt of options) {
        // Skip query-string refs
        if (opt.$ref === '#/$defs/query-string') continue;

        // Check nested oneOf/anyOf
        if (opt.oneOf || opt.anyOf) {
          const nested = findOptions(opt);
          if (nested.patternOptions.length > 0) patternOptions = nested.patternOptions;
          if (nested.enumOptions.length > 0) enumOptions = nested.enumOptions;
          continue;
        }

        // Check for pattern option
        if (opt.type === 'string' && opt.pattern && /^\^?\([^)]+\)\(\\\+/.test(opt.pattern)) {
          patternOptions = extractPatternOptions(opt.pattern);
        }

        // Check for enum option
        if (opt.enum && opt.type === 'string') {
          enumOptions = opt.enum;
        }
      }

      return { patternOptions, enumOptions };
    };

    return findOptions(schema);
  }, [schema, defs]);

  // Check if current value is an enum value
  const isEnumSelected = useMemo(() => {
    return isEnumValue(value, enumOptions);
  }, [value, enumOptions]);

  // Handle pattern chip selection
  const handlePatternChange = useCallback(
    (name, selectedArray) => {
      const newValue = serializePatternValue(selectedArray);
      onChange(newValue || undefined);
    },
    [onChange]
  );

  // Handle enum option click (for chips rendering)
  const handleEnumClick = useCallback(
    (enumValue) => {
      // If clicking the currently selected enum, deselect it
      if (value === enumValue) {
        onChange(undefined);
      } else {
        // Select the enum value (clears any pattern selections)
        onChange(enumValue);
      }
    },
    [value, onChange]
  );

  // Parse current value for ChipsInput (empty if enum is selected)
  const selectedPatternOptions = useMemo(() => {
    if (isEnumSelected) return [];
    return parsePatternValue(value);
  }, [value, isEnumSelected]);

  const hasSelection = selectedPatternOptions.length > 0 || isEnumSelected;

  return (
    <div>
      {label && (
        <div className="mb-2 text-sm font-medium text-gray-700">{label}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Pattern options (multi-select chips) */}
        {patternOptions.map((option) => {
          const isSelected = selectedPatternOptions.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                const newSelection = isSelected
                  ? selectedPatternOptions.filter((opt) => opt !== option)
                  : [...selectedPatternOptions, option];
                handlePatternChange('pattern-multiselect', newSelection);
              }}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isSelected
                  ? 'bg-white border-2 border-blue-500 text-blue-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {option}
            </button>
          );
        })}

        {/* Enum options (mutually exclusive chips) */}
        {enumOptions.map((enumValue) => {
          const isSelected = value === enumValue;
          return (
            <button
              key={enumValue}
              type="button"
              onClick={() => handleEnumClick(enumValue)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isSelected
                  ? 'bg-white border-2 border-orange-500 text-orange-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {enumValue}
            </button>
          );
        })}
      </div>

      {/* Selection indicator and clear button */}
      {hasSelection && (
        <div className="mt-2 text-xs text-gray-500">
          {selectedPatternOptions.length > 0 && (
            <span>{selectedPatternOptions.length} selected</span>
          )}
          {isEnumSelected && <span>"{value}" selected</span>}
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="ml-2 text-blue-600 hover:text-blue-800"
          >
            Clear all
          </button>
        </div>
      )}

      {description && (
        <FormHelperText sx={{ mt: 1 }}>{description}</FormHelperText>
      )}
    </div>
  );
}

export default PatternMultiSelectField;
