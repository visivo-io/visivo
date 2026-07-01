import React from 'react';
import { TextField } from '@mui/material';
import { getNumberConstraints } from '../utils/fieldResolver';

/**
 * Number field component for numeric input
 * @param {object} props
 * @param {number} props.value - Current value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function NumberField({
  value,
  onChange,
  schema,
  defs = {},
  label,
  description,
  disabled = false,
}) {
  const constraints = getNumberConstraints(schema, defs);

  const handleChange = e => {
    const inputValue = e.target.value;

    if (inputValue === '') {
      onChange(undefined);
      return;
    }

    const numValue = constraints.isInteger ? parseInt(inputValue, 10) : parseFloat(inputValue);

    if (!isNaN(numValue)) {
      onChange(numValue);
    }
  };

  // Determine step value
  let step = constraints.step;
  if (!step) {
    step = constraints.isInteger ? 1 : 'any';
  }

  return (
    <TextField
      fullWidth
      size="small"
      variant="outlined"
      type="number"
      value={value ?? ''}
      onChange={handleChange}
      label={label}
      helperText={description}
      disabled={disabled}
      inputProps={{
        min: constraints.min,
        max: constraints.max,
        step: step,
      }}
      placeholder={schema?.default !== undefined ? String(schema.default) : undefined}
    />
  );
}

export default NumberField;
