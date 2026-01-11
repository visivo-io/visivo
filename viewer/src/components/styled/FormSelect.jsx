import React, { forwardRef } from 'react';

/**
 * FormSelect - Styled select with floating label, error handling, and disabled state
 *
 * Features:
 * - Material Design floating label (always floated for select)
 * - Error state with red border and message
 * - Disabled state with gray background
 * - Required field indicator
 * - Helper text support
 *
 * Props:
 * - id: Select element id (required for label association)
 * - label: Label text
 * - value: Selected value
 * - onChange: Change handler (receives event)
 * - error: Error message string (falsy = no error)
 * - disabled: Whether select is disabled
 * - required: Whether to show required indicator
 * - helperText: Optional helper text below select
 * - children: Option elements
 * - className: Additional classes for the container
 * - ...rest: Passed to select element
 */
const FormSelect = forwardRef(
  ({ id, label, value, onChange, error, disabled, required, helperText, children, className = '', ...rest }, ref) => {
    const selectClasses = `
      block w-full px-3 py-2.5 text-sm text-gray-900
      bg-white rounded-md border appearance-none
      focus:outline-none focus:ring-2 focus:border-primary-500
      ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
      ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
    `;

    const labelClasses = `
      absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
      bg-white px-1 left-2
      ${error ? 'text-red-500' : 'text-gray-500'}
    `;

    return (
      <div className={`relative ${className}`}>
        <select
          ref={ref}
          id={id}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={selectClasses}
          {...rest}
        >
          {children}
        </select>
        <label htmlFor={id} className={labelClasses}>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        {helperText && !error && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      </div>
    );
  }
);

FormSelect.displayName = 'FormSelect';

export default FormSelect;
