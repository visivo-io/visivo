import React from 'react';
import { TextField, InputAdornment, Tooltip } from '@mui/material';
import { PiCode } from 'react-icons/pi';

/**
 * Expression field component for fields containing ${ref(...)} expression strings.
 * Used for the Visivo @-accessor pattern in props_mapping and similar fields.
 * @param {object} props
 * @param {string} props.value - Current value (e.g. "${ref(insight.name).field}")
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
// eslint-disable-next-line no-template-curly-in-string
const PLACEHOLDER = '${ref(insight.name).field}';

export function ExpressionField({ value, onChange, schema, label, description, disabled = false }) {
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
      placeholder={PLACEHOLDER}
      multiline
      maxRows={3}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Tooltip title="Expression / @-accessor">
              <span>
                <PiCode size={14} style={{ opacity: 0.5 }} />
              </span>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
}

export default ExpressionField;
