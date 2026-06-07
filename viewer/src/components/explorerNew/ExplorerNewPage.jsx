import { useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import LeftPanel from './ExplorerLeftPanel';
import CenterPanel from './CenterPanel';
import ExplorerRightPanel from './ExplorerRightPanel';
import ExplorerDndContext from './ExplorerDndContext';
import ExplorerReturnChip from './ExplorerReturnChip';
import VerticalDivider from '../common/VerticalDivider';
import useStore from '../../stores/store';
import { usePanelResize } from '../../hooks/usePanelResize';

const ExplorerNewPage = () => {
  const leftNavCollapsed = useStore((s) => s.explorerLeftNavCollapsed);
  const modelTabs = useStore((s) => s.explorerModelTabs);
  const explorerSources = useStore((s) => s.explorerSources);
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const createModelTab = useStore((s) => s.createModelTab);
  const createInsight = useStore((s) => s.createInsight);
  const fetchDefaults = useStore((s) => s.fetchDefaults);
  const fetchExplorerDiff = useStore((s) => s.fetchExplorerDiff);

  // Watch explorer state changes to trigger backend diff (debounced)
  const explorerModelStates = useStore((s) => s.explorerModelStates);
  const explorerInsightStates = useStore((s) => s.explorerInsightStates);
  const explorerChartName = useStore((s) => s.explorerChartName);
  const explorerChartLayout = useStore((s) => s.explorerChartLayout);

  const diffTimerRef = useRef(null);
  useEffect(() => {
    if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
    diffTimerRef.current = setTimeout(() => {
      fetchExplorerDiff();
    }, 300);
    return () => clearTimeout(diffTimerRef.current);
  }, [explorerModelStates, explorerInsightStates, explorerChartName, explorerChartLayout, chartInsightNames, fetchExplorerDiff]);

  // Fetch project defaults on mount (needed for default source selection)
  useEffect(() => {
    fetchDefaults();
  }, [fetchDefaults]);

  // Auto-create a model tab when the page loads with no tabs and sources are available
  useEffect(() => {
    if (modelTabs.length === 0 && explorerSources.length > 0) {
      createModelTab();
    }
  }, [modelTabs.length, explorerSources.length, createModelTab]);

  // Auto-create an insight on initial page load only (not when user removes all insights)
  const insightAutoCreated = useRef(false);
  useEffect(() => {
    if (modelTabs.length > 0 && chartInsightNames.length === 0 && !insightAutoCreated.current) {
      insightAutoCreated.current = true;
      createInsight();
    }
  }, [modelTabs.length, chartInsightNames.length, createInsight]);

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
        data-testid="explorer-new-page"
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

export default ExplorerNewPage;
