import React from 'react';
import RefTextArea from './RefTextArea';

/**
 * RequiredFieldsSection - Reusable component for rendering required data fields
 *
 * This component displays a section of required fields for a chart type or form,
 * using RefTextArea for each field with proper validation and error handling.
 *
 * Props:
 * - fields: Array of field objects with { name, label, placeholder, optional, description }
 * - values: Object containing current values for each field
 * - errors: Object containing error messages keyed by field name
 * - onChange: Function(fieldName, value) - Called when a field value changes
 * - title: Section title (default: "Required Data Fields")
 */
const RequiredFieldsSection = ({
  fields = [],
  values = {},
  errors = {},
  onChange,
  title = 'Required Data Fields',
}) => {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
        {title}
      </div>
      {fields.map(field => (
        <RefTextArea
          key={field.name}
          id={`field-${field.name}`}
          label={field.label}
          value={values[field.name] || ''}
          onChange={value => onChange(field.name, value)}
          placeholder={field.placeholder || ' '}
          rows={1}
          required={!field.optional}
          error={errors[field.name]}
          helperText={field.description}
        />
      ))}
    </div>
  );
};

export default RequiredFieldsSection;
