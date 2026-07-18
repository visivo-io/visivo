import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import LeftPanel from './ExplorerLeftPanel';
import CenterPanel from './CenterPanel';
import ExplorerRightPanel from './ExplorerRightPanel';
import ExplorerDndContext from './ExplorerDndContext';
import ExplorerReturnChip from './ExplorerReturnChip';
import VerticalDivider from '../common/VerticalDivider';
import useStore from '../../stores/store';
import { usePanelResize } from '../../hooks/usePanelResize';
import useExplorerWorkbenchInit from './useExplorerWorkbenchInit';

const ExplorerPage = () => {
  const leftNavCollapsed = useStore((s) => s.explorerLeftNavCollapsed);

  // The diff-debounce / auto-create-model-tab / auto-create-insight /
  // fetch-defaults init effects are shared with the Explore 2.0
  // ExplorationWorkbench (Phase 2) via this hook — see its docstring.
  useExplorerWorkbenchInit();

  // J-3 (VIS-782): show a "Back to dashboard" return bar only when Explorer was
  // entered from Build mode (`?return_to=workspace`).
  const [searchParams] = useSearchParams();
  const showReturnBar = searchParams.get('return_to') === 'workspace' && !!searchParams.get('dashboard');

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
      <div
        className="flex flex-col h-[calc(100vh-3rem)] bg-gray-50 overflow-hidden"
        data-testid="explorer-page"
      >
        {showReturnBar && (
          <div
            data-testid="explorer-return-bar"
            className="flex items-center gap-2 flex-shrink-0 border-b border-secondary-200 bg-white px-3 py-1.5"
          >
            <ExplorerReturnChip />
          </div>
        )}
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
          <ExplorerRightPanel />
        </div>
      </div>
    </ExplorerDndContext>
  );
};

export default ExplorerPage;
