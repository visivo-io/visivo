import React from 'react';
import { TextField } from '@mui/material';

/**
 * String field component for text input
 * @param {object} props
 * @param {string} props.value - Current value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function StringField({ value, onChange, schema, label, description, disabled = false }) {
  const handleChange = e => {
    const newValue = e.target.value;
    // If empty string, pass undefined to allow cleanup
    onChange(newValue === '' ? undefined : newValue);
  };

  return (
    <TextField
      fullWidth
      size="small"
      variant="outlined"
      value={value ?? ''}
      onChange={handleChange}
      label={label}
      helperText={description}
      disabled={disabled}
      placeholder={schema?.default !== undefined ? String(schema.default) : undefined}
    />
  );
}

export default StringField;
