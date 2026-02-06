import React, { useMemo, useState } from 'react';
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
import { isQueryStringValue } from '../../../../utils/queryString';
import { supportsQueryString, getStaticSchema } from './utils/schemaUtils';
import { resolveFieldType } from './utils/fieldResolver';
import { getFieldComponent } from './fields/fields';

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

  // Track explicit user toggle intent so mode persists when value is cleared
  const [forceQueryMode, setForceQueryMode] = useState(() => isQueryStringValue(value));

  // Get the static (non-query-string) schema for the field
  const staticSchema = useMemo(() => getStaticSchema(schema, defs), [schema, defs]);

  // Determine field type for static mode
  const fieldType = useMemo(() => resolveFieldType(schema, defs), [schema, defs]);

  // Get the appropriate field component
  const FieldComponent = getFieldComponent(fieldType);

  // Handle mode toggle - preserve value until user edits in new mode
  const handleModeChange = (event, newMode) => {
    if (newMode === null) return; // Don't allow deselect
    setForceQueryMode(newMode === 'query');
  };

  // Handle value change
  const handleChange = newValue => {
    onChange(newValue);
  };

  // Current mode based on value or explicit user toggle
  const currentMode = (forceQueryMode || isQueryMode) ? 'query' : 'static';

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
        {currentMode === 'query' || (queryStringSupported && !staticSchema) ? (
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
            schema={fieldType === 'patternMultiselect' ? schema : (staticSchema || schema)}
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
