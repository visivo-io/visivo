import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Box, Button, Collapse, Divider, Typography, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { PropertyRow } from './PropertyRow';
import { PropertySearch } from './PropertySearch';
import {
  flattenSchemaProperties,
  getValueAtPath,
  setValueAtPath,
} from './utils/schemaUtils';

/**
 * SchemaEditor - Main container for schema-driven form editing
 *
 * @param {object} props
 * @param {object} props.schema - The JSON schema object
 * @param {object} props.value - Current values object
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {Array<string>} props.excludeProperties - Properties to hide (e.g., ['type'])
 * @param {Array<string>} props.initiallyExpanded - Properties to show by default
 * @param {boolean} props.disabled - Whether the editor is disabled
 */
export function SchemaEditor({
  schema,
  value = {},
  onChange,
  excludeProperties = ['type'],
  initiallyExpanded = [],
  disabled = false,
}) {
  // Track which properties the user has added to the form
  const [addedProperties, setAddedProperties] = useState(() => new Set(initiallyExpanded));

  // Track whether the property picker is open
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);

  // Get $defs from schema
  const defs = schema?.$defs || {};

  // Flatten all available properties from schema
  const allProperties = useMemo(() => {
    if (!schema) return [];

    const flattened = flattenSchemaProperties(schema, '', defs);

    // Filter out excluded properties
    return flattened.filter(prop => !excludeProperties.includes(prop.path.split('.')[0]));
  }, [schema, defs, excludeProperties]);

  // Properties that are currently shown in the form
  const displayedProperties = useMemo(() => {
    return allProperties.filter(prop => addedProperties.has(prop.path));
  }, [allProperties, addedProperties]);

  // Track if we've already synced initial values
  const hasInitializedFromValue = useRef(false);

  // Sync properties from initial value (only once on mount or when value changes)
  useEffect(() => {
    if (!value || typeof value !== 'object' || allProperties.length === 0) return;

    // Only sync once per value reference
    if (hasInitializedFromValue.current) return;
    hasInitializedFromValue.current = true;

    const pathsWithValues = new Set();

    const extractPaths = (obj, prefix = '') => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;

      Object.keys(obj).forEach(key => {
        const path = prefix ? `${prefix}.${key}` : key;
        pathsWithValues.add(path);

        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          extractPaths(obj[key], path);
        }
      });
    };

    extractPaths(value);

    // Add any paths with values to the added set
    const pathsToAdd = [];
    pathsWithValues.forEach(path => {
      if (allProperties.some(p => p.path === path)) {
        pathsToAdd.push(path);
      }
    });

    if (pathsToAdd.length > 0) {
      setAddedProperties(prev => {
        const next = new Set(prev);
        pathsToAdd.forEach(path => next.add(path));
        return next;
      });
    }
  }, [value, allProperties]);

  // Handle property value change
  const handlePropertyChange = useCallback(
    (path, newValue) => {
      const updatedValue = setValueAtPath(value, path, newValue);
      onChange(updatedValue);
    },
    [value, onChange]
  );

  // Handle property removal
  const handlePropertyRemove = useCallback(
    path => {
      // Remove the value
      const updatedValue = setValueAtPath(value, path, undefined);
      onChange(updatedValue);

      // Remove from added properties
      setAddedProperties(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    },
    [value, onChange]
  );

  // Handle property toggle in search
  const handlePropertyToggle = useCallback(path => {
    setAddedProperties(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Sort displayed properties - top-level first, then nested
  const sortedDisplayedProperties = useMemo(() => {
    return [...displayedProperties].sort((a, b) => {
      const aDepth = a.path.split('.').length;
      const bDepth = b.path.split('.').length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.path.localeCompare(b.path);
    });
  }, [displayedProperties]);

  if (!schema) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography color="text.secondary">No schema available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Property picker toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={showPropertyPicker ? <ExpandLessIcon /> : <AddIcon />}
          onClick={() => setShowPropertyPicker(!showPropertyPicker)}
          disabled={disabled}
        >
          {showPropertyPicker ? 'Hide Properties' : 'Add Properties'}
        </Button>

        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {displayedProperties.length} of {allProperties.length} properties
        </Typography>
      </Box>

      {/* Property search/picker */}
      <Collapse in={showPropertyPicker}>
        <PropertySearch
          properties={allProperties}
          selectedPaths={addedProperties}
          onToggle={handlePropertyToggle}
          disabled={disabled}
        />
      </Collapse>

      {/* Displayed properties */}
      {sortedDisplayedProperties.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            bgcolor: 'grey.50',
            borderRadius: 1,
            border: '1px dashed',
            borderColor: 'grey.300',
          }}
        >
          <Typography color="text.secondary" gutterBottom>
            No properties added yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Click "Add Properties" to select which fields to configure
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {sortedDisplayedProperties.map(prop => (
            <PropertyRow
              key={prop.path}
              path={prop.path}
              value={getValueAtPath(value, prop.path)}
              onChange={newValue => handlePropertyChange(prop.path, newValue)}
              onRemove={() => handlePropertyRemove(prop.path)}
              schema={prop.schema}
              defs={defs}
              description={prop.description}
              disabled={disabled}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default SchemaEditor;
