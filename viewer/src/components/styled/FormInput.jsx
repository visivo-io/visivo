import React, { forwardRef } from 'react';

/**
 * FormInput - Styled text input with floating label, error handling, and disabled state
 *
 * Features:
 * - Material Design floating label animation
 * - Error state with red border and message
 * - Disabled state with gray background
 * - Required field indicator
 * - Helper text support
 *
 * Props:
 * - id: Input element id (required for label association)
 * - label: Label text
 * - value: Input value
 * - onChange: Change handler (receives event)
 * - error: Error message string (falsy = no error)
 * - disabled: Whether input is disabled
 * - required: Whether to show required indicator
 * - helperText: Optional helper text below input
 * - className: Additional classes for the container
 * - ...rest: Passed to input element
 */
const FormInput = forwardRef(
  ({ id, label, value, onChange, error, disabled, required, helperText, className = '', ...rest }, ref) => {
    const inputClasses = `
      block w-full px-3 py-2.5 text-sm text-gray-900
      bg-white rounded-md border appearance-none
      focus:outline-none focus:ring-2 focus:border-primary-500
      peer placeholder-transparent
      ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
      ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
    `;

    const labelClasses = `
      absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
      bg-white px-1 left-2
      peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
      peer-placeholder-shown:top-1/2
      peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
      ${error ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
    `;

    return (
      <div className={`relative ${className}`}>
        <input
          ref={ref}
          type="text"
          id={id}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder=" "
          className={inputClasses}
          {...rest}
        />
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

FormInput.displayName = 'FormInput';

export default FormInput;
