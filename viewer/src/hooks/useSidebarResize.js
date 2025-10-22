import { useState, useEffect } from 'react';

export const useSidebarResize = (initialWidth = 300) => {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = e => {
      if (!isResizing) return;

      // Calculate new width based on mouse position
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleMouseDown = e => {
    e.preventDefault();
    setIsResizing(true);
  };

  return {
    sidebarWidth,
    isResizing,
    handleMouseDown,
  };
};
