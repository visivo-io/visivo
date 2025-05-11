import React from 'react';

const InputShell = ({ children }) => (
  <div className="block px-2 pb-1 pt-2.5 w-full text-sm text-gray-900 bg-transparent rounded-md border border-gray-300 appearance-none focus-within:border-primary">
    {children}
  </div>
);

export default InputShell; 