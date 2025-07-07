import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tooltip } from 'flowbite-react';
import { FiInfo } from 'react-icons/fi';

const TumblerNavItem = ({ icon: Icon, label, to, tooltip }) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const location = useLocation();

  // Consider the nav item active if the current route matches the 'to' prop
  const isActive = location.pathname === to;
  const showLabel = hovered || focused || isActive;
  const showInfoIcon = hovered;

  // Animation classes
  // We'll use translate-y and opacity for a tumbler effect
  // Custom keyframes could be added for more realism if needed
  return (
    <Link
      to={to}
      aria-label={label}
      tabIndex={0}
      className={`relative flex items-center justify-center h-12 w-12 transition-colors duration-200 outline-none
        text-white hover:text-[#D25946] focus:text-[#D25946] ${isActive ? 'text-[#D25946]' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/* Icon tumbles up on hover/focus/active */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out
          ${showLabel ? 'opacity-0 -translate-y-6 pointer-events-none' : 'opacity-100 translate-y-0'}
        `}
      >
        <Icon className="w-6 h-6" />
      </span>
      {/* Label + info icon tumbles down on hover/focus/active */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out
          ${showLabel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'}
        `}
        style={{ pointerEvents: showLabel ? 'auto' : 'none' }}
      >
        <span className="flex flex-row items-center bg-transparent text-md font-medium">
          {label}
          <span
            className={`inline-flex items-center justify-center transition-all duration-500 w-3
              ${showInfoIcon ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}
          >
            <Tooltip
              content={tooltip || label}
              placement="bottom"
              trigger="hover"
              className="opacity-90 text-xs"
            >
              <span
                tabIndex={0}
                aria-label="More info"
                className="ml-1 cursor-pointer text-[#D25946] hover:text-[#B24538] focus:text-[#B24538] transition-colors duration-200 outline-none flex items-center"
              >
                <FiInfo className="w-3 h-3 align-middle" style={{ display: 'inline', verticalAlign: 'middle' }} />
                <span className="sr-only">Show info</span>
              </span>
            </Tooltip>
          </span>
        </span>
      </span>
      {/* For accessibility, visually hidden label for screen readers */}
      <span className="sr-only">{label}</span>
    </Link>
  );
};

export default TumblerNavItem;
