import React from 'react';
import { FormControl, InputLabel, Select, MenuItem, FormHelperText } from '@mui/material';
import { getEnumValues } from '../utils/fieldResolver';

/**
 * Enum field component with dropdown select
 * @param {object} props
 * @param {string} props.value - Current value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function EnumField({
  value,
  onChange,
  schema,
  defs = {},
  label,
  description,
  disabled = false,
}) {
  const enumValues = getEnumValues(schema, defs);

  const handleChange = e => {
    const newValue = e.target.value;
    // Empty string means clear selection
    onChange(newValue === '' ? undefined : newValue);
  };

  // Generate a unique ID for accessibility
  const labelId = `enum-field-${label?.replace(/\s+/g, '-')?.toLowerCase() || 'label'}`;

  return (
    <FormControl fullWidth size="small" disabled={disabled}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value ?? ''}
        onChange={handleChange}
        label={label}
        displayEmpty={false}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {enumValues.map(enumValue => (
          <MenuItem key={String(enumValue)} value={enumValue}>
            {String(enumValue)}
          </MenuItem>
        ))}
      </Select>
      {description && <FormHelperText>{description}</FormHelperText>}
    </FormControl>
  );
}

export default EnumField;
