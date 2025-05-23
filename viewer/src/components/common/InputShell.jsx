import React from 'react';

const InputShell = ({ label, children, hasContent, containerRef }) => (
  <div className="relative w-full h-full" ref={containerRef}>
    <div className="flex items-center w-full px-2 pt-2.5 pb-1 text-sm text-gray-900 bg-transparent rounded-md border border-gray-300 appearance-none focus-within:border-primary ">
      {children}
    </div>
    <label
      className={
        `absolute text-md pt-1 text-gray-500 duration-300 transform z-10 origin-[0] bg-white px-2 py-0 left-1 pointer-events-none ` +
        (hasContent
          ? '-translate-y-4 scale-75 top-1'
          : 'scale-100 top-2')
      }
    >
      {label}
    </label>
  </div>
);

export default InputShell; 