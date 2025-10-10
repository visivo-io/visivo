import React from 'react';
import ExplorerTree from '../explorerTree/ExplorerTree';
import QueryPanel from './QueryPanel';
import VerticalDivider from './VerticalDivider';
import { Container, MainContent, RightPanel, Info } from './Explorer.styles';

const ExplorerLayout = ({
  info,
  treeData,
  selectedType,
  sidebarWidth,
  isResizingSidebar,
  onTabChange,
  onItemClick,
  onSidebarResizeStart,
}) => {
  return (
    <Container>
      <div className="flex flex-col h-full">
        {info && (
          <Info>
            <p>{info}</p>
          </Info>
        )}
        <MainContent>
          <div style={{ width: `${sidebarWidth}px`, flexShrink: 0, display: 'flex' }}>
            <ExplorerTree
              data={treeData}
              selectedTab={selectedType}
              onTypeChange={onTabChange}
              onItemClick={onItemClick}
            />
          </div>

          <VerticalDivider
            isDragging={isResizingSidebar}
            handleMouseDown={onSidebarResizeStart}
          />

          <RightPanel>
            <QueryPanel />
          </RightPanel>
        </MainContent>
      </div>
    </Container>
  );
};

export default ExplorerLayout;
