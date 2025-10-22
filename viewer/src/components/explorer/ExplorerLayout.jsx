import React, { useState } from 'react';
import ExplorerTree from '../explorerTree/ExplorerTree';
import QueryPanel from './QueryPanel';
import VerticalDivider from './VerticalDivider';
import { Container, MainContent, RightPanel, Info } from './Explorer.styles';
import CreateObjectModal from '../editors/CreateObjectModal';
import AddIcon from '@mui/icons-material/Add';

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
  const [showCreateSourceModal, setShowCreateSourceModal] = useState(false);
  return (
    <Container>
      <div className="flex flex-col h-full">
        {info && (
          <Info>
            <p>{info}</p>
          </Info>
        )}
        <MainContent>
          <div
            style={{
              width: `${sidebarWidth}px`,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ExplorerTree
                data={treeData}
                selectedTab={selectedType}
                onTypeChange={onTabChange}
                onItemClick={onItemClick}
              />
            </div>

            {/* Add Data Source Button - Only show when on sources tab */}
            {selectedType === 'sources' && (
              <div className="p-3 border-t border-gray-200 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowCreateSourceModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2E46] transition-colors font-medium text-sm"
                >
                  <AddIcon fontSize="small" />
                  Add Data Source
                </button>
              </div>
            )}
          </div>

          <VerticalDivider isDragging={isResizingSidebar} handleMouseDown={onSidebarResizeStart} />

          <RightPanel>
            <QueryPanel />
          </RightPanel>
        </MainContent>
      </div>

      {/* Create Source Modal */}
      <CreateObjectModal
        isOpen={showCreateSourceModal}
        onClose={() => setShowCreateSourceModal(false)}
        objSelectedProperty="sources"
        objStep="type"
        showFileOption={false}
        onSubmitCallback={newSource => {
          // Modal will automatically update namedChildren store
          // Tree will refresh automatically via store subscription
          setShowCreateSourceModal(false);
        }}
      />
    </Container>
  );
};

export default ExplorerLayout;
