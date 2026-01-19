import React, { useState, useRef, useEffect } from 'react';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

/**
 * PreviewDrawer - A resizable drawer component that slides in from behind the edit panel
 * Used to show previews alongside edit forms
 *
 * Props:
 * - isOpen: Boolean to control drawer open/closed state
 * - title: Title for the preview section
 * - children: Content to render in the drawer
 * - defaultWidth: Default width in pixels (default: 500)
 * - minWidth: Minimum width in pixels (default: 300)
 * - maxWidth: Maximum width in pixels (default: 800)
 * - editPanelWidth: Width of the edit panel (default: 384)
 */
const PreviewDrawer = ({
  isOpen,
  title = 'Preview',
  children,
  defaultWidth = 500,
  minWidth = 300,
  maxWidth = 800,
  editPanelWidth = 384,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const drawerRef = useRef(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Handle resize drag
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const diff = e.clientX - startX.current;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + diff));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      };
    }
  }, [isResizing, minWidth, maxWidth]);

  const handleResizeStart = (e) => {
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = width;
  };

  return (
    <>
      {/* Drawer container */}
      <div
        ref={drawerRef}
        className={`fixed top-12 bottom-0 bg-white border-r border-gray-200 shadow-lg transition-transform duration-300 ease-in-out`}
        style={{
          zIndex: -1, // Negative to ensure it's behind the panel
          width: `${width}px`,
          right: `${editPanelWidth}px`, // Position at the left edge of edit panel
          transform: isOpen ? 'translateX(0)' : `translateX(${width}px)`, // Slide right to hide behind panel
        }}
      >
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <VisibilityIcon fontSize="small" className="text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          </div>
        </div>

        {/* Content */}
        <div className="h-full overflow-auto" style={{ height: 'calc(100% - 52px)' }}>
          {children}
        </div>

        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary-500 transition-colors group"
          onMouseDown={handleResizeStart}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -left-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DragIndicatorIcon fontSize="small" className="text-gray-400" />
          </div>
        </div>
      </div>


    </>
  );
};

export default PreviewDrawer;