import React, { useMemo } from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Typography,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CodeIcon from '@mui/icons-material/Code';
import TuneIcon from '@mui/icons-material/Tune';
import RefTextArea from '../RefTextArea';
import { isQueryStringValue, supportsQueryString, getStaticSchema } from './utils/schemaUtils';
import { resolveFieldType } from './utils/fieldResolver';
import { getFieldComponent } from './fields';

/**
 * PropertyRow - A single property in the schema editor with optional query-string toggle
 *
 * @param {object} props
 * @param {string} props.path - Dot-separated property path (e.g., "marker.color")
 * @param {any} props.value - Current value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {function} props.onRemove - Handler to remove this property
 * @param {object} props.schema - The JSON schema for this property
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.description - Property description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function PropertyRow({
  path,
  value,
  onChange,
  onRemove,
  schema,
  defs = {},
  description,
  disabled = false,
}) {
  // Determine if this property supports query-string values
  const queryStringSupported = useMemo(() => supportsQueryString(schema), [schema]);

  // Determine if current value is a query-string
  const isQueryMode = useMemo(() => isQueryStringValue(value), [value]);

  // Get the static (non-query-string) schema for the field
  const staticSchema = useMemo(() => getStaticSchema(schema, defs), [schema, defs]);

  // Determine field type for static mode
  const fieldType = useMemo(() => resolveFieldType(schema, defs), [schema, defs]);

  // Get the appropriate field component
  const FieldComponent = getFieldComponent(fieldType);

  // Handle mode toggle
  const handleModeChange = (event, newMode) => {
    if (newMode === null) return; // Don't allow deselect

    if (newMode === 'query' && !isQueryMode) {
      // Switching to query mode - clear the static value
      onChange(undefined);
    } else if (newMode === 'static' && isQueryMode) {
      // Switching to static mode - clear the query value
      onChange(undefined);
    }
  };

  // Handle value change
  const handleChange = newValue => {
    onChange(newValue);
  };

  // Get display name from path (last segment)
  const displayName = path.split('.').pop();

  // Current mode based on value
  const currentMode = isQueryMode ? 'query' : 'static';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'grey.50',
        '&:hover': { bgcolor: 'grey.100' },
      }}
    >
      {/* Header row with path, toggle, and remove button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Property path */}
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 500,
            flexGrow: 1,
            color: 'text.primary',
          }}
        >
          {path}
        </Typography>

        {/* Query-string toggle (only if supported) */}
        {queryStringSupported && (
          <ToggleButtonGroup
            value={currentMode}
            exclusive
            onChange={handleModeChange}
            size="small"
            disabled={disabled}
          >
            <ToggleButton value="static" aria-label="static value">
              <Tooltip title="Static value">
                <TuneIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="query" aria-label="query string">
              <Tooltip title="Query expression">
                <CodeIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        )}

        {/* Remove button */}
        {onRemove && (
          <IconButton size="small" onClick={onRemove} disabled={disabled} aria-label="remove property">
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Field input */}
      <Box>
        {isQueryMode || (queryStringSupported && !staticSchema) ? (
          // Query-string mode - use RefTextArea
          <RefTextArea
            value={value || ''}
            onChange={handleChange}
            label=""
            rows={2}
            helperText={description}
            disabled={disabled}
            allowedTypes={['model', 'dimension', 'metric']}
          />
        ) : (
          // Static mode - use appropriate field component
          <FieldComponent
            value={value}
            onChange={handleChange}
            schema={staticSchema || schema}
            defs={defs}
            label=""
            description={description}
            disabled={disabled}
          />
        )}
      </Box>
    </Box>
  );
}

export default PropertyRow;
