import { useState, useCallback, useRef } from 'react';
import { Tooltip } from 'flowbite-react';

/**
 * LazyTooltip - A wrapper around Flowbite's Tooltip that only renders the
 * Floating positioning component when first hovered.
 *
 * This prevents the expensive Floating component from mounting on page load
 * and re-rendering on scroll/resize events when the tooltip isn't even visible.
 *
 * Usage is identical to Flowbite's Tooltip:
 * <LazyTooltip content="Tooltip text" placement="bottom">
 *   <button>Hover me</button>
 * </LazyTooltip>
 */
const LazyTooltip = ({ children, content, placement = 'top', className, ...props }) => {
  const [hasBeenHovered, setHasBeenHovered] = useState(false);
  const containerRef = useRef(null);

  const handleMouseEnter = useCallback(() => {
    if (!hasBeenHovered) {
      setHasBeenHovered(true);
    }
  }, [hasBeenHovered]);

  // If never hovered, just render the children with a hover listener
  if (!hasBeenHovered) {
    return (
      <span ref={containerRef} onMouseEnter={handleMouseEnter} className="inline-flex">
        {children}
      </span>
    );
  }

  // Once hovered, render the full Flowbite Tooltip
  return (
    <Tooltip content={content} placement={placement} className={className} {...props}>
      {children}
    </Tooltip>
  );
};

export default LazyTooltip;
