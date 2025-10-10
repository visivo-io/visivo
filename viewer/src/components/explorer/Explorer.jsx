import React from 'react';
import { useExplorerLogic } from '../../hooks/useExplorerLogic';
import { useSidebarResize } from '../../hooks/useSidebarResize';
import ExplorerLayout from './ExplorerLayout';

const QueryExplorer = () => {
  // Business logic
  const { info, treeData, selectedType, handleTabChange, handleItemClick } = useExplorerLogic();

  // Sidebar resizing
  const { sidebarWidth, isResizing, handleMouseDown } = useSidebarResize(300);

  return (
    <ExplorerLayout
      info={info}
      treeData={treeData}
      selectedType={selectedType}
      sidebarWidth={sidebarWidth}
      isResizingSidebar={isResizing}
      onTabChange={handleTabChange}
      onItemClick={handleItemClick}
      onSidebarResizeStart={handleMouseDown}
    />
  );
};

export default QueryExplorer;
