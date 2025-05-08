import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleChevronDown, faCircleChevronUp } from '@fortawesome/free-solid-svg-icons';

const Menu = ({ children, hovering }) => {
  const [showMenu, setShowMenu] = useState(false);

  if (!hovering && showMenu) {
    setShowMenu(false);
  }

  const onMenuClick = () => {
    setShowMenu(!showMenu);
  };

  return (
    <div className="absolute mt-3 top-0 right-5 z-20">
      <button
        style={{ visibility: hovering ? 'visible' : 'hidden' }}
        onClick={onMenuClick}
        className="text-white bg-secondary-400 hover:bg-secondary-600 focus:ring-4 focus:outline-hidden focus:ring-secondary-300 font-medium rounded-lg text-sm px-3 py-2.5 text-center inline-flex items-center"
        type="button"
      >
        <FontAwesomeIcon icon={showMenu ? faCircleChevronUp : faCircleChevronDown} />
      </button>
      <div
        style={{ visibility: showMenu && hovering ? 'visible' : 'hidden' }}
        className="absolute top-10 right-5 z-20 bg-white w-80 divide-y divide-gray-100 rounded-lg shadow-xs"
      >
        <ul className="py-2 text-sm text-gray-700" aria-labelledby="dropdownDefaultButton">
          {children}
        </ul>
      </div>
    </div>
  );
};

export default Menu;
