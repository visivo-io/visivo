import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Read-only placeholder for object-valued fields (e.g. Insight.props,
 * Table.format_cells) when they surface in the generic SchemaEditor engine.
 *
 * These nested objects are edited in their own dedicated editors — letting the
 * generic StringField render them would let a stray keystroke clobber the whole
 * object with a string. This component shows a muted JSON preview and a note,
 * and NEVER calls `onChange`, so the underlying value is untouchable here.
 *
 * Same prop signature as StringField so it slots into the field registry.
 *
 * @param {object} props
 * @param {*} props.value - Current (object) value
 * @param {function} props.onChange - Change handler (never invoked)
 * @param {object} props.schema - The JSON schema for this field
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled (always read-only)
 */
// eslint-disable-next-line no-unused-vars
export function ObjectField({ value, onChange, schema, label, description, disabled = false }) {
  let preview;
  try {
    preview = value === undefined ? '' : JSON.stringify(value, null, 2);
  } catch {
    preview = String(value);
  }

  return (
    <Box>
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {label}
        </Typography>
      )}
      <Box
        component="pre"
        aria-readonly="true"
        sx={{
          m: 0,
          p: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          color: 'text.secondary',
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          maxHeight: 160,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {preview || '{}'}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {description ? `${description} — ` : ''}Edited in a dedicated editor
      </Typography>
    </Box>
  );
}

export default ObjectField;
