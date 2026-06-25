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
import { RefSlotField } from './RefSlotField';
import { ExpressionField } from './ExpressionField';
import { ObjectField } from './ObjectField';

export { StringField } from './StringField';
export { NumberField } from './NumberField';
export { BooleanField } from './BooleanField';
export { EnumField } from './EnumField';
export { ColorField } from './ColorField';
export { ArrayField } from './ArrayField';
export { PatternMultiSelectField } from './PatternMultiSelectField';
export { RefSlotField } from './RefSlotField';
export { ExpressionField } from './ExpressionField';
export { ObjectField } from './ObjectField';

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
  RefSlotField,
  ExpressionField,
  ObjectField,
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
    object: ObjectField, // Read-only — nested objects are edited in dedicated editors
    patternMultiselect: PatternMultiSelectField,
    ref: RefSlotField,
    'query-string': ExpressionField,
    unknown: StringField, // Fallback
  };

  return componentMap[fieldType] || StringField;
}
