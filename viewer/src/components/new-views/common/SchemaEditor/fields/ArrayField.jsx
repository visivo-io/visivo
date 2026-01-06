import React from 'react';
import {
  Box,
  IconButton,
  Button,
  FormControl,
  FormHelperText,
  Typography,
  Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { getArrayItemSchema, getDefaultValue } from '../utils/fieldResolver';
import { resolveFieldType } from '../utils/fieldResolver';
import { getFieldComponent } from './index';

/**
 * Array field component for list items
 * @param {object} props
 * @param {Array} props.value - Current array value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function ArrayField({
  value = [],
  onChange,
  schema,
  defs = {},
  label,
  description,
  disabled = false,
}) {
  const itemSchema = getArrayItemSchema(schema, defs);
  const itemFieldType = itemSchema ? resolveFieldType(itemSchema, defs) : 'string';
  const ItemComponent = getFieldComponent(itemFieldType);

  const handleAdd = () => {
    const defaultValue = getDefaultValue(itemSchema, defs);
    const newArray = [...(value || []), defaultValue ?? ''];
    onChange(newArray);
  };

  const handleRemove = index => {
    const newArray = [...(value || [])];
    newArray.splice(index, 1);
    onChange(newArray.length > 0 ? newArray : undefined);
  };

  const handleItemChange = (index, newValue) => {
    const newArray = [...(value || [])];
    newArray[index] = newValue;
    onChange(newArray);
  };

  const arrayValue = Array.isArray(value) ? value : [];

  return (
    <FormControl fullWidth>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          {label}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAdd}
          disabled={disabled}
          variant="outlined"
        >
          Add
        </Button>
      </Box>

      {arrayValue.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>
          No items. Click Add to create one.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {arrayValue.map((item, index) => (
            <Paper
              key={index}
              variant="outlined"
              sx={{ p: 1, display: 'flex', alignItems: 'flex-start', gap: 1 }}
            >
              <Box sx={{ flexGrow: 1 }}>
                <ItemComponent
                  value={item}
                  onChange={newValue => handleItemChange(index, newValue)}
                  schema={itemSchema}
                  defs={defs}
                  label={`Item ${index + 1}`}
                  disabled={disabled}
                />
              </Box>
              <IconButton
                size="small"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                aria-label={`Remove item ${index + 1}`}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Paper>
          ))}
        </Box>
      )}

      {description && <FormHelperText>{description}</FormHelperText>}
    </FormControl>
  );
}

export default ArrayField;
