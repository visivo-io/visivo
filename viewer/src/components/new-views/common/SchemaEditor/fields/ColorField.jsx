import React, { useState, useEffect } from 'react';
import { TextField, InputAdornment, Box, Popover } from '@mui/material';

/**
 * Color field component with color picker
 * @param {object} props
 * @param {string} props.value - Current color value (hex format)
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function ColorField({ value, onChange, schema, label, description, disabled = false }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [inputValue, setInputValue] = useState(value || '');

  // Sync input value when external value changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleTextChange = e => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Only update parent if it's empty or looks like a valid color
    if (newValue === '') {
      onChange(undefined);
    } else if (isValidColor(newValue)) {
      onChange(newValue);
    }
  };

  const handleColorPickerChange = e => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  const handleBlur = () => {
    // On blur, if the input is not a valid color, revert to last valid value
    if (inputValue && !isValidColor(inputValue)) {
      setInputValue(value || '');
    }
  };

  const handleSwatchClick = event => {
    if (!disabled) {
      setAnchorEl(event.currentTarget);
    }
  };

  const handlePopoverClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  // Display color (use black as fallback for preview)
  const displayColor = isValidColor(inputValue) ? inputValue : value || '#000000';

  return (
    <>
      <TextField
        fullWidth
        size="small"
        variant="outlined"
        value={inputValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        label={label}
        helperText={description}
        disabled={disabled}
        placeholder="#000000"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Box
                onClick={handleSwatchClick}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: 0.5,
                  backgroundColor: displayColor,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: disabled ? 'default' : 'pointer',
                }}
                data-testid="color-swatch"
              />
            </InputAdornment>
          ),
        }}
      />
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handlePopoverClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
      >
        <Box sx={{ p: 1 }}>
          <input
            type="color"
            value={displayColor}
            onChange={handleColorPickerChange}
            style={{ width: 200, height: 150, border: 'none', cursor: 'pointer' }}
            data-testid="color-picker"
          />
        </Box>
      </Popover>
    </>
  );
}

/**
 * Check if a string is a valid CSS color
 */
function isValidColor(color) {
  if (!color) return false;

  // Hex colors
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color)) {
    return true;
  }

  // RGB/RGBA
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(color)) {
    return true;
  }

  // HSL/HSLA
  if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+\s*)?\)$/.test(color)) {
    return true;
  }

  // Named colors (basic check - just alphanumeric)
  if (/^[a-zA-Z]+$/.test(color)) {
    return true;
  }

  return false;
}

export default ColorField;
