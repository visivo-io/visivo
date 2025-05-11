import React from 'react';

const InputShell = ({ label, children, hasContent }) => (
  <div className="relative">
    <div className="block px-2 pb-1 pt-2.5 w-full text-sm text-gray-900 bg-transparent rounded-md border border-gray-300 appearance-none focus-within:border-primary">
      {children}
    </div>
    <label
      className={
        `absolute text-sm text-gray-500 duration-300 transform z-10 origin-[0] bg-white px-2 left-1 ` +
        (hasContent
          ? '-translate-y-4 scale-75 top-2'
          : 'peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 top-2')
      }
      style={{ pointerEvents: 'none' }}
    >
      {label}
    </label>
  </div>
);

export default InputShell; 