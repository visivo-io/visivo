import React, { useMemo, useCallback } from 'react';
import { FormControl, FormHelperText, Select, MenuItem, InputLabel } from '@mui/material';
import ChipsInput from '../../../../items/inputs/ChipsInput';
import {
  parsePatternValue,
  serializePatternValue,
  isEnumValue,
  extractPatternOptions,
} from '../utils/patternUtils';
import { getStaticSchema } from '../utils/schemaUtils';

/**
 * Pattern-based multi-select field component
 * Handles schemas with pattern-based combinations (e.g., "lines+markers")
 * and optional single enum values (e.g., "none")
 *
 * Schema pattern:
 * {
 *   "oneOf": [
 *     {
 *       "type": "string",
 *       "pattern": "^(lines|markers|text)(\\+(lines|markers|text))*$"
 *     },
 *     {
 *       "enum": ["none", "skip"]  // Optional
 *     },
 *     {
 *       "$ref": "#/$defs/query-string"
 *     }
 *   ]
 * }
 *
 * @param {object} props
 * @param {string} props.value - Current value (e.g., "lines+markers" or "none")
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {object} props.schema - The JSON schema for this field
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.label - Field label
 * @param {string} props.description - Field description
 * @param {boolean} props.disabled - Whether the field is disabled
 */
export function PatternMultiSelectField({
  value,
  onChange,
  schema,
  defs = {},
  label,
  description,
  disabled = false,
}) {
  // Extract pattern and enum options from schema (memoized)
  const { patternOptions, enumOptions } = useMemo(() => {
    if (!schema) return { patternOptions: [], enumOptions: [] };

    // Parse original schema (don't use getStaticSchema as it collapses oneOf)
    const findOptions = (schemaToCheck, depth = 0) => {
      console.log(`[findOptions depth=${depth}]`, JSON.stringify(schemaToCheck).substring(0, 200));
      const options = schemaToCheck.oneOf || schemaToCheck.anyOf;
      if (!options) {
        console.log(`[findOptions depth=${depth}] No oneOf/anyOf`);
        return { patternOptions: [], enumOptions: [] };
      }

      let patternOptions = [];
      let enumOptions = [];

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        console.log(`[findOptions depth=${depth} opt=${i}]`, JSON.stringify(opt).substring(0, 150));

        // Skip query-string refs
        if (opt.$ref === '#/$defs/query-string') {
          console.log(`[findOptions depth=${depth} opt=${i}] Skipping query-string`);
          continue;
        }

        // Check nested oneOf/anyOf
        if (opt.oneOf || opt.anyOf) {
          console.log(`[findOptions depth=${depth} opt=${i}] Found nested oneOf/anyOf, recursing`);
          const nested = findOptions(opt, depth + 1);
          if (nested.patternOptions.length > 0) patternOptions = nested.patternOptions;
          if (nested.enumOptions.length > 0) enumOptions = nested.enumOptions;
          continue;
        }

        // Check for pattern option
        if (opt.type === 'string' && opt.pattern) {
          const regex = /^\^?\([^)]+\)\(\\\+/;
          const matches = regex.test(opt.pattern);
          console.log(`[findOptions depth=${depth} opt=${i}] Pattern check:`, { pattern: opt.pattern, matches });
          if (matches) {
            patternOptions = extractPatternOptions(opt.pattern);
            console.log(`[findOptions depth=${depth} opt=${i}] Extracted:`, patternOptions);
          }
        }

        // Check for enum option
        if (opt.enum && opt.type === 'string') {
          console.log(`[findOptions depth=${depth} opt=${i}] Found enum:`, opt.enum);
          enumOptions = opt.enum;
        }
      }

      console.log(`[findOptions depth=${depth}] Returning:`, { patternOptions, enumOptions });
      return { patternOptions, enumOptions };
    };

    return findOptions(schema);
  }, [schema, defs]);

  // Determine mode based on current value
  const mode = useMemo(() => {
    if (!value) return 'pattern';
    if (isEnumValue(value, enumOptions)) return 'enum';
    return 'pattern';
  }, [value, enumOptions]);

  // Handle pattern chip selection
  const handlePatternChange = useCallback(
    (name, selectedArray) => {
      const newValue = serializePatternValue(selectedArray);
      onChange(newValue || undefined);
    },
    [onChange]
  );

  // Handle enum dropdown selection
  const handleEnumChange = useCallback(
    (event) => {
      const newValue = event.target.value;
      onChange(newValue === '' ? undefined : newValue);
    },
    [onChange]
  );

  // Parse current value for ChipsInput
  const selectedPatternOptions = useMemo(() => {
    if (mode !== 'pattern') return [];
    return parsePatternValue(value);
  }, [value, mode]);

  const labelId = `pattern-field-${label?.replace(/\s+/g, '-')?.toLowerCase() || 'label'}`;

  // Pattern mode: ChipsInput with Tailwind styling (no FormControl wrapper)
  if (mode === 'pattern') {
    console.log('[PatternMultiSelectField] Rendering pattern mode:', {
      label,
      patternOptions,
      selectedPatternOptions,
      value,
    });
    return (
      <div>
        <ChipsInput
          label={label}
          options={patternOptions}
          selectedValues={selectedPatternOptions}
          name="pattern-multiselect"
          setInputJobValue={handlePatternChange}
        />
        {description && (
          <FormHelperText sx={{ mt: 1 }}>{description}</FormHelperText>
        )}
      </div>
    );
  }

  // Enum mode: Material-UI Select (needs FormControl wrapper)
  return (
    <FormControl fullWidth size="small" disabled={disabled}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value || ''}
        onChange={handleEnumChange}
        label={label}
        displayEmpty={false}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {enumOptions.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {opt}
          </MenuItem>
        ))}
      </Select>
      {description && <FormHelperText>{description}</FormHelperText>}
    </FormControl>
  );
}

export default PatternMultiSelectField;
