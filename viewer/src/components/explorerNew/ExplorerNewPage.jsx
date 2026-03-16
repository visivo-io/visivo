import React, { useRef } from 'react';
import LeftPanel from './LeftPanel';
import CenterPanel from './CenterPanel';
import InsightEditorPanel from './InsightEditorPanel';
import ExplorerDndContext from './ExplorerDndContext';
import VerticalDivider from '../explorer/VerticalDivider';
import useStore from '../../stores/store';
import { usePanelResize } from '../../hooks/usePanelResize';

const ExplorerNewPage = () => {
  const leftNavCollapsed = useStore((s) => s.explorerLeftNavCollapsed);
  const containerRef = useRef(null);

  const {
    ratio: leftRatio,
    isResizing: isLeftResizing,
    handleMouseDown: handleLeftMouseDown,
  } = usePanelResize({
    containerRef,
    direction: 'horizontal',
    initialRatio: 0.18,
    minSize: 48,
    maxRatio: 0.3,
    minRatio: 0.03,
  });

  const leftWidth = leftNavCollapsed ? 48 : Math.round(leftRatio * 100);

  return (
    <ExplorerDndContext>
      <div className="flex flex-col h-[calc(100vh-3rem)] bg-gray-50 overflow-hidden" data-testid="explorer-new-page">
        <div className="flex flex-1 overflow-hidden" ref={containerRef}>
          <div
            style={{ width: leftNavCollapsed ? '48px' : `${leftWidth}%` }}
            className="flex-shrink-0 overflow-hidden"
          >
            <LeftPanel />
          </div>
          {!leftNavCollapsed && (
            <VerticalDivider isDragging={isLeftResizing} handleMouseDown={handleLeftMouseDown} />
          )}
          <CenterPanel />
          <InsightEditorPanel />
        </div>
      </div>
    </ExplorerDndContext>
  );
};

export default ExplorerNewPage;
