import { useState, useEffect, useCallback } from 'react';

/**
 * Generalized panel resize hook supporting both horizontal and vertical resize.
 * Adapted from useSidebarResize but with container-relative positioning.
 *
 * @param {Object} options
 * @param {React.RefObject} options.containerRef - Ref to the container element for relative positioning
 * @param {'horizontal'|'vertical'} options.direction - Resize direction
 * @param {number} options.initialRatio - Initial split ratio (0-1), default 0.5
 * @param {number} options.minSize - Minimum size in px for the first panel, default 100
 * @param {number} options.maxRatio - Maximum ratio for the first panel, default 0.8
 * @param {number} options.minRatio - Minimum ratio for the first panel, default 0.2
 * @returns {{ ratio: number, isResizing: boolean, handleMouseDown: function }}
 */
export const usePanelResize = ({
  containerRef,
  direction = 'horizontal',
  initialRatio = 0.5,
  minSize = 100,
  maxRatio = 0.8,
  minRatio = 0.2,
} = {}) => {
  const [ratio, setRatio] = useState(initialRatio);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'ew-resize' : 'ns-resize';

    const handleMouseMove = (e) => {
      const container = containerRef?.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();

      let newRatio;
      if (direction === 'horizontal') {
        const offset = e.clientX - rect.left;
        newRatio = offset / rect.width;
      } else {
        const offset = e.clientY - rect.top;
        newRatio = offset / rect.height;
      }

      const containerSize = direction === 'horizontal' ? rect.width : rect.height;
      const minRatioFromSize = minSize / containerSize;
      const effectiveMin = Math.max(minRatio, minRatioFromSize);

      newRatio = Math.max(effectiveMin, Math.min(maxRatio, newRatio));
      setRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, containerRef, direction, minSize, maxRatio, minRatio]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  return { ratio, isResizing, handleMouseDown };
};
