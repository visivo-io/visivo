import React, { useMemo } from 'react';
import useStore from '../../../stores/store';
import { getTypeByValue } from './objectTypeConfigs';
import Select from '../../common/Select';
import {
  parseRefValue,
  formatRefExpression,
  parseMultiRefValue,
  formatMultiRefValue,
} from '../../../utils/refString';

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
  // Get type configuration for placeholder labels (colors + icon now come from
  // <Select>'s FieldPill option renderer, keyed off the option `type`).
  const typeConfig = getTypeByValue(objectType);
  const singularLabel = typeConfig?.singularLabel || objectType;
  const pluralLabel = typeConfig?.label || `${objectType}s`;

  // Get objects from store - get individual arrays and combine with useMemo to avoid infinite loops
  const sources = useStore(state => state.sources);
  const models = useStore(state => state.models);
  const csvScriptModels = useStore(state => state.csvScriptModels);
  const localMergeModels = useStore(state => state.localMergeModels);

  // Combine objects based on type (memoized to prevent infinite re-renders)
  const objects = useMemo(() => {
    switch (objectType) {
      case 'source':
        return sources || [];
      case 'model':
        // Include all types of models
        return [
          ...(models || []),
          ...(csvScriptModels || []),
          ...(localMergeModels || []),
        ];
      default:
        return [];
    }
  }, [objectType, sources, models, csvScriptModels, localMergeModels]);

  // Parse current value to get selected name(s)
  const selectedValues = useMemo(() => {
    if (!value) return [];

    if (multiple) {
      return parseMultiRefValue(value);
    }

    // Ensure value is a string and trim it
    const stringValue = typeof value === 'string' ? value.trim() : String(value);
    const parsed = parseRefValue(stringValue);

    // Return parsed value or the original if parsing returns nothing
    const result = parsed || stringValue;
    return result ? [result] : [];
  }, [value, multiple]);

  // Default placeholder based on type and mode
  const defaultPlaceholder = multiple
    ? `Select ${pluralLabel.toLowerCase()}...`
    : `Select a ${singularLabel.toLowerCase()}...`;

  // Build type-colored options (rendered as <FieldPill> by <Select>).
  const options = useMemo(
    () =>
      objects.map(obj => ({
        value: obj.name,
        label: obj.name,
        type: objectType,
      })),
    [objects, objectType]
  );

  // <Select> works in bare names; serialize back to ref() on the way out.
  const handleChange = next => {
    if (multiple) {
      const names = Array.isArray(next) ? next : [];
      onChange(names.length === 0 ? null : formatMultiRefValue(names));
    } else {
      onChange(next ? formatRefExpression(next) : null);
    }
  };

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <Select
        data-testid={`ref-selector-${objectType}`}
        aria-label={label || defaultPlaceholder}
        isMulti={multiple}
        isSearchable
        value={multiple ? selectedValues : selectedValues[0] || ''}
        options={options}
        onChange={handleChange}
        placeholder={placeholder || defaultPlaceholder}
        disabled={disabled}
      />

      {helperText && (!multiple ? !selectedValues[0] : true) && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}
    </div>
  );
};

export default RefSelector;
