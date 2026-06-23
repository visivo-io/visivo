import React from 'react';
import { TextField, InputAdornment, Tooltip } from '@mui/material';
import { PiLink } from 'react-icons/pi';

/**
 * Reference slot field component for fields that reference another Visivo object.
 * @param {object} props
 * @param {string} props.value - Current value (e.g. "ref(source.my_source)" or "my_source")
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function RefSlotField({ value, onChange, schema, label, description, disabled = false }) {
  const handleChange = e => {
    const v = e.target.value;
    onChange(v === '' ? undefined : v);
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
      placeholder="ref(type.name)"
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Tooltip title="Object reference">
              <span>
                <PiLink size={14} style={{ opacity: 0.5 }} />
              </span>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
}

export default RefSlotField;
