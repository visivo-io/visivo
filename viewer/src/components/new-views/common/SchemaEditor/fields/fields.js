/**
 * Field component registry
 * Maps field types to their React components
 */

import { StringField } from './StringField';
import { NumberField } from './NumberField';
import { BooleanField } from './BooleanField';
import { EnumField } from './EnumField';
import { ColorField } from './ColorField';
import { ArrayField } from './ArrayField';
import { PatternMultiSelectField } from './PatternMultiSelectField';

export { StringField } from './StringField';
export { NumberField } from './NumberField';
export { BooleanField } from './BooleanField';
export { EnumField } from './EnumField';
export { ColorField } from './ColorField';
export { ArrayField } from './ArrayField';
export { PatternMultiSelectField } from './PatternMultiSelectField';

/**
 * Registry mapping field type names to components
 */
export const FIELD_COMPONENTS = {
  StringField,
  NumberField,
  BooleanField,
  EnumField,
  ColorField,
  ArrayField,
  PatternMultiSelectField,
};

/**
 * Get field component by type name
 * @param {string} fieldType - The field type from resolveFieldType
 * @returns {React.Component} The field component
 */
export function getFieldComponent(fieldType) {
  const componentMap = {
    string: StringField,
    number: NumberField,
    boolean: BooleanField,
    enum: EnumField,
    color: ColorField,
    colorscale: ArrayField, // Colorscales are arrays of colors
    array: ArrayField,
    patternMultiselect: PatternMultiSelectField,
    unknown: StringField, // Fallback
  };

  return componentMap[fieldType] || StringField;
}
