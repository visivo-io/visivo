import React, { useLayoutEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * PortalDropdownMenu — VIS-901 #6.
 *
 * Renders an input dropdown's option menu into `document.body` (a portal),
 * positioned directly under its anchor. The canvas item slot clips its content
 * with `overflow-hidden` (Dashboard.renderRow), so an `absolute`-positioned menu
 * inside the slot was cut off below the item div. Escaping to the body via a
 * portal makes the menu overlay OUTSIDE the slot regardless of any ancestor
 * overflow — fixing the regression where the option list (and the "Search
 * options…" box) were invisible on the canvas.
 *
 * The menu is positioned with FIXED coordinates measured from the anchor's
 * bounding box, and re-measured on scroll / resize so it tracks the anchor while
 * open. It flips ABOVE the anchor when there isn't enough room below.
 *
 * @param {React.RefObject} anchorRef - ref to the trigger wrapper (the menu is
 *        positioned to its bounding box).
 * @param {React.ReactNode} children - the menu contents.
 * @param {number} [maxHeight=320] - max menu height (px) used for flip math.
 */
const PortalDropdownMenu = ({ anchorRef, menuRef, children, maxHeight = 320 }) => {
  const [style, setStyle] = useState(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Flip above only when there's clearly more room there.
    const flipUp = spaceBelow < Math.min(maxHeight, 240) && spaceAbove > spaceBelow;
    const next = {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      maxHeight: Math.max(120, (flipUp ? spaceAbove : spaceBelow) - 12),
    };
    if (flipUp) {
      next.bottom = window.innerHeight - rect.top + 4;
    } else {
      next.top = rect.bottom + 4;
    }
    setStyle(next);
  }, [anchorRef, maxHeight]);

  useLayoutEffect(() => {
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [reposition]);

  if (typeof document === 'undefined' || !style) return null;

  return createPortal(
    <div
      ref={menuRef}
      data-testid="portal-dropdown-menu"
      className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg"
      style={style}
    >
      {children}
    </div>,
    document.body
  );
};

export default PortalDropdownMenu;
