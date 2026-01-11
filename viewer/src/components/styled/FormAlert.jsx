import React from 'react';

/**
 * FormAlert - Alert component for displaying status/error messages in forms
 *
 * Props:
 * - children: Alert content
 * - variant: Alert type - 'error' (default), 'success', 'warning', 'info'
 * - className: Additional classes
 */
const FormAlert = ({ children, variant = 'error', className = '' }) => {
  const variantClasses = {
    error: 'bg-red-50 text-red-700 border-red-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <div className={`p-3 rounded-md text-sm ${variantClasses[variant] || variantClasses.error} ${className}`}>
      {children}
    </div>
  );
};

export default FormAlert;
