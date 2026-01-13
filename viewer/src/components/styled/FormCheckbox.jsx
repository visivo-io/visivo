import React, { forwardRef } from 'react';

/**
 * FormCheckbox - Styled checkbox with label
 *
 * Props:
 * - id: Checkbox element id (required for label association)
 * - label: Label text
 * - checked: Whether checkbox is checked
 * - onChange: Change handler (receives event)
 * - disabled: Whether checkbox is disabled
 * - helperText: Optional helper text below checkbox
 * - className: Additional classes for the container
 * - ...rest: Passed to input element
 */
const FormCheckbox = forwardRef(
  ({ id, label, checked, onChange, disabled, helperText, className = '', ...rest }, ref) => {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <input
            ref={ref}
            type="checkbox"
            id={id}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            {...rest}
          />
          <label htmlFor={id} className="text-sm text-gray-700">
            {label}
          </label>
        </div>
        {helperText && <p className="mt-1 text-xs text-gray-500 ml-6">{helperText}</p>}
      </div>
    );
  }
);

FormCheckbox.displayName = 'FormCheckbox';

export default FormCheckbox;
