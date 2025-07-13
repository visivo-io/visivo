import React from 'react';

const MenuContainer = ({ children, flexDirection = 'flex-row' }) => {
  return (
    <div className="absolute mt-3 top-0 right-5 z-20 pl-4">
      <div className={`flex ${flexDirection} gap-2`}>{children}</div>
    </div>
  );
};

export default MenuContainer;
