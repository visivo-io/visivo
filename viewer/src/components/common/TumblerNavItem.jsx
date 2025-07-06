import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tooltip } from 'flowbite-react';

const TumblerNavItem = ({ icon: Icon, label, to, ariaLabel }) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const location = useLocation();

  // Consider the nav item active if the current route matches the 'to' prop
  const isActive = location.pathname === to;
  const showLabel = hovered || focused || isActive;

  // Animation classes
  // We'll use translate-y and opacity for a tumbler effect
  // Custom keyframes could be added for more realism if needed
  return (
    <Tooltip content={label} placement="bottom" trigger="hover">
      <Link
        to={to}
        aria-label={ariaLabel || label}
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
            ${showLabel ? 'opacity-0 -translate-y-6' : 'opacity-100 translate-y-0'}
          `}
        >
          <Icon className="w-6 h-6" />
        </span>
        {/* Label tumbles down on hover/focus/active */}
        <span
          className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out text-sm font-medium
            ${showLabel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
          `}
        >
          {label}
        </span>
        {/* For accessibility, visually hidden label for screen readers */}
        <span className="sr-only">{label}</span>
      </Link>
    </Tooltip>
  );
};

export default TumblerNavItem; 