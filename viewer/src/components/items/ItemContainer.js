import React from 'react';

export const ItemContainer = React.forwardRef((props, ref) => (
  <div 
    {...props} 
    ref={ref}
    className="relative rounded-2xl shadow-lg transition duration-200 overflow-hidden hover:shadow-lg hover:z-40 hover:border-gray-300 border border-gray-150"
  />
));
