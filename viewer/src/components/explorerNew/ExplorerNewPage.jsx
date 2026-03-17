import React, { useRef, useCallback } from 'react';
import LeftPanel from './ExplorerLeftPanel';
import CenterPanel from './CenterPanel';
import EditPanel from '../new-views/common/EditPanel';
import ExplorerDndContext from './ExplorerDndContext';
import VerticalDivider from '../explorer/VerticalDivider';
import useStore from '../../stores/store';
import { usePanelResize } from '../../hooks/usePanelResize';
import { useObjectSave } from '../../hooks/useObjectSave';

const ExplorerNewPage = () => {
  const leftNavCollapsed = useStore((s) => s.explorerLeftNavCollapsed);
  const editStack = useStore((s) => s.explorerEditStack);
  const pushEdit = useStore((s) => s.pushExplorerEdit);
  const popEdit = useStore((s) => s.popExplorerEdit);
  const clearEditStack = useStore((s) => s.clearExplorerEditStack);

  // Refresh data after successful save
  const fetchModels = useStore((s) => s.fetchModels);
  const fetchDimensions = useStore((s) => s.fetchDimensions);
  const fetchMetrics = useStore((s) => s.fetchMetrics);
  const fetchInsights = useStore((s) => s.fetchInsights);
  const fetchCharts = useStore((s) => s.fetchCharts);
  const fetchSources = useStore((s) => s.fetchSources);
  const fetchInputs = useStore((s) => s.fetchInputs);

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

  // Edit stack management
  const currentEdit = editStack.length > 0 ? editStack[editStack.length - 1] : null;
  const canGoBack = editStack.length > 1;

  const setEditStack = useCallback(
    (updater) => {
      const newStack = typeof updater === 'function' ? updater(editStack) : updater;
      // Clear and rebuild — explorerEditStack is managed via push/pop/clear
      useStore.setState({ explorerEditStack: newStack });
    },
    [editStack]
  );

  const onSuccessfulSave = useCallback(async () => {
    // Refresh all relevant data stores after a successful save
    await Promise.all([
      fetchModels?.(),
      fetchDimensions?.(),
      fetchMetrics?.(),
      fetchInsights?.(),
      fetchCharts?.(),
      fetchSources?.(),
      fetchInputs?.(),
    ]);
  }, [fetchModels, fetchDimensions, fetchMetrics, fetchInsights, fetchCharts, fetchSources, fetchInputs]);

  const handleSave = useObjectSave(currentEdit, setEditStack, onSuccessfulSave);

  const handleNavigateTo = useCallback(
    (type, object, options) => {
      pushEdit(type, object, options);
    },
    [pushEdit]
  );

  const handleClose = useCallback(() => {
    clearEditStack();
  }, [clearEditStack]);

  const handleGoBack = useCallback(() => {
    popEdit();
  }, [popEdit]);

  return (
    <ExplorerDndContext>
      <div
        className="flex flex-col h-[calc(100vh-3rem)] bg-gray-50 overflow-hidden"
        data-testid="explorer-new-page"
      >
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
          {currentEdit ? (
            <EditPanel
              editItem={currentEdit}
              canGoBack={canGoBack}
              onGoBack={handleGoBack}
              onNavigateTo={handleNavigateTo}
              isCreate={currentEdit.isCreate || false}
              onClose={handleClose}
              onSave={handleSave}
            />
          ) : (
            <div
              className="w-96 flex-shrink-0 border-l border-secondary-200 bg-white flex items-center justify-center"
              data-testid="edit-panel-empty"
            >
              <span className="text-sm text-secondary-400 text-center px-6">
                Select an object from the left panel to edit
              </span>
            </div>
          )}
        </div>
      </div>
    </ExplorerDndContext>
  );
};

export default ExplorerNewPage;
