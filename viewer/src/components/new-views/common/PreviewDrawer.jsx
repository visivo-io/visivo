import React, { useState, useRef, useEffect } from 'react';
import VisibilityIcon from '@mui/icons-material/Visibility';
import useStore from '../../../stores/store';

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
  const previewDrawerWidth = useStore(state => state.previewDrawerWidth);
  const setPreviewDrawerWidth = useStore(state => state.setPreviewDrawerWidth);
  const [isResizing, setIsResizing] = useState(false);
  const drawerRef = useRef(null);

  // Use global width, or default if not set
  const width = previewDrawerWidth || defaultWidth;

  // Handle resize drag
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      // Calculate width based on distance from the right edge
      // The drawer is positioned from the right (right: editPanelWidth)
      const rightEdge = window.innerWidth - editPanelWidth;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, rightEdge - e.clientX));
      setPreviewDrawerWidth(newWidth);
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
  }, [isResizing, minWidth, maxWidth, editPanelWidth, setPreviewDrawerWidth]);

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return (
    <>
      {/* Drawer container */}
      <div
        ref={drawerRef}
        data-testid="preview-drawer"
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
            <VisibilityIcon fontSize="small" className="text-gray-600" data-testid="preview-icon" />
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          </div>
        </div>

        {/* Content */}
        <div className="h-full overflow-auto" style={{ height: 'calc(100% - 52px)' }}>
          {children}
        </div>

        {/* Resize handle - matches explorer divider style */}
        <div
          data-testid="resize-handle"
          className={`absolute top-0 left-0 w-1 h-full cursor-ew-resize bg-gray-200 hover:bg-gray-300 flex items-center justify-center group ${
            isResizing ? 'bg-gray-400' : ''
          }`}
          onMouseDown={handleResizeStart}
        >
          <div data-testid="resize-pill" className="w-1 h-8 bg-gray-400 group-hover:bg-gray-500 rounded-full"></div>
        </div>
      </div>


    </>
  );
};

export default PreviewDrawer;