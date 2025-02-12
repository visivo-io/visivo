import React from 'react';

export function Container({ children, className = '' }) {
  return (
    <div className={`w-full flex flex-col ${className}`}>
      {children}
    </div>
  );
}