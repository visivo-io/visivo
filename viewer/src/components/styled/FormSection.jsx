import React from 'react';

/**
 * FormSection - Section header with optional action button
 *
 * Props:
 * - title: Section title text
 * - action: Optional action element (button, etc.) to render on the right
 * - className: Additional classes
 */
const FormSection = ({ title, action, className = '' }) => {
  return (
    <div className={`flex items-center justify-between border-b border-gray-200 pb-2 ${className}`}>
      <h3 className="text-sm font-medium text-gray-700">{title}</h3>
      {action}
    </div>
  );
};

export default FormSection;
