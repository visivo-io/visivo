import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleChevronDown, faCircleChevronUp } from '@fortawesome/free-solid-svg-icons';
import { Tooltip } from '@mui/material';

const Menu = ({ children, hovering, buttonChildren, buttonProps = {}, withDropDown = true, showToolTip = false, toolTip = "" }) => {
  const [showMenu, setShowMenu] = useState(false);

  if (!hovering && showMenu) {
    setShowMenu(false);
  }

  const onMenuClick = () => {
    setShowMenu(!showMenu);
  };

  const mergedButtonProps = withDropDown
    ? {
        ...buttonProps,
        style: { visibility: hovering ? 'visible' : 'hidden', ...(buttonProps.style || {}) },
        onClick: onMenuClick,
      }
    : buttonProps;

  const renderButton = (
    <button
      {...mergedButtonProps}
      className="text-white bg-secondary-400 hover:bg-secondary-600 focus:ring-4 focus:outline-hidden focus:ring-secondary-300 font-medium rounded-lg text-sm px-3 py-2.5 text-center inline-flex items-center"
      type="button"
    >
      {buttonChildren ? buttonChildren : <FontAwesomeIcon icon={showMenu ? faCircleChevronUp : faCircleChevronDown} />}
    </button>
  )

  return (
    <>
      {
        showToolTip ? (
          <Tooltip title={toolTip}>
            <span>{ renderButton }</span>
          </Tooltip>
        ) : renderButton
      }
      {withDropDown && (
        <div
          style={{ visibility: showMenu && hovering ? 'visible' : 'hidden' }}
          className="absolute top-10 right-5 z-20 bg-white w-80 divide-y divide-gray-100 rounded-lg shadow-xs"
        >
          <ul className="py-2 text-sm text-gray-700" aria-labelledby="dropdownDefaultButton">
            {children}
          </ul>
        </div>
      )}
    </>
  );
};

export default Menu;
