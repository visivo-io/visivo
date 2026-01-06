import React from 'react';
import { ToggleButton, ToggleButtonGroup, FormControl, FormHelperText, Box } from '@mui/material';

/**
 * Boolean field component with toggle buttons
 * @param {object} props
 * @param {boolean} props.value - Current value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function BooleanField({ value, onChange, schema, label, description, disabled = false }) {
  const handleChange = (event, newValue) => {
    // newValue can be 'true', 'false', or null (if deselected)
    if (newValue === null) {
      onChange(undefined);
    } else {
      onChange(newValue === 'true');
    }
  };

  // Convert boolean to string for toggle group
  const stringValue = value === true ? 'true' : value === false ? 'false' : null;

  return (
    <FormControl fullWidth>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flexGrow: 1, color: 'text.secondary', fontSize: '0.875rem' }}>{label}</Box>
        <ToggleButtonGroup
          value={stringValue}
          exclusive
          onChange={handleChange}
          size="small"
          disabled={disabled}
        >
          <ToggleButton value="true" aria-label="true">
            True
          </ToggleButton>
          <ToggleButton value="false" aria-label="false">
            False
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {description && <FormHelperText>{description}</FormHelperText>}
    </FormControl>
  );
}

export default BooleanField;
