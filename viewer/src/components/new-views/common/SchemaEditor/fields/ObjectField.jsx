import React, { useState } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  Typography,
  FormControl,
  FormHelperText,
  Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { getStaticSchema } from '../utils/schemaUtils';
import { resolveFieldType } from '../utils/fieldResolver';
import { getFieldComponent } from './index';

/**
 * Object field component for nested properties
 * @param {object} props
 * @param {object} props.value - Current object value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 * @param {boolean} props.defaultExpanded - Whether to expand by default
 */
export function ObjectField({
  value = {},
  onChange,
  schema,
  defs = {},
  label,
  description,
  disabled = false,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const resolvedSchema = getStaticSchema(schema, defs);
  const properties = resolvedSchema?.properties || {};

  const handlePropertyChange = (propName, newValue) => {
    const newObj = { ...(value || {}) };

    if (newValue === undefined) {
      delete newObj[propName];
    } else {
      newObj[propName] = newValue;
    }

    // If object is empty, set to undefined
    onChange(Object.keys(newObj).length > 0 ? newObj : undefined);
  };

  const propertyEntries = Object.entries(properties);

  if (propertyEntries.length === 0) {
    return (
      <FormControl fullWidth>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
          No properties defined
        </Typography>
        {description && <FormHelperText>{description}</FormHelperText>}
      </FormControl>
    );
  }

  return (
    <FormControl fullWidth>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
          py: 0.5,
          px: 1,
          mx: -1,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          {label}
        </Typography>
        <IconButton size="small" aria-label={expanded ? 'collapse' : 'expand'}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {propertyEntries.map(([propName, propSchema]) => {
              const fieldType = resolveFieldType(propSchema, defs);
              const FieldComponent = getFieldComponent(fieldType);
              const propValue = value?.[propName];
              const propDescription = propSchema.description || '';

              return (
                <FieldComponent
                  key={propName}
                  value={propValue}
                  onChange={newValue => handlePropertyChange(propName, newValue)}
                  schema={propSchema}
                  defs={defs}
                  label={propName}
                  description={propDescription}
                  disabled={disabled}
                />
              );
            })}
          </Box>
        </Paper>
      </Collapse>

      {description && <FormHelperText>{description}</FormHelperText>}
    </FormControl>
  );
}

export default ObjectField;
