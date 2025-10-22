import React from 'react';
import { StyledSidebar, SelectContainer, TreeContainer } from './styles/TreeStyles';
import ModelsTracesList from './ModelsTracesList';
import SourcesTree from './SourcesTree';
import { HiOutlineDatabase } from 'react-icons/hi';
import { FaServer } from 'react-icons/fa';
import { Tooltip } from '@mui/material';

const ExplorerTree = React.memo(({ data, selectedTab, onTypeChange, onItemClick }) => {
  return (
    <StyledSidebar>
      <SelectContainer>
        <div className="flex items-center justify-center gap-5 p-2">
          <Tooltip title="Sources" placement="bottom">
            <button
              onClick={() => onTypeChange('sources')}
              className={`p-2 rounded-lg transition-all duration-200 ${
                selectedTab === 'sources'
                  ? 'bg-blue-100 text-blue-700 shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <FaServer size={22} />
            </button>
          </Tooltip>

          <Tooltip title="SQL Models" placement="bottom">
            <button
              onClick={() => onTypeChange('models')}
              className={`p-2 rounded-lg transition-all duration-200 ${
                selectedTab === 'models'
                  ? 'bg-violet-100 text-violet-700 shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <HiOutlineDatabase size={28} />
            </button>
          </Tooltip>
        </div>
      </SelectContainer>

      <TreeContainer>
        {selectedTab === 'sources' ? (
          <SourcesTree />
        ) : (
          <ModelsTracesList data={data} onItemClick={onItemClick} />
        )}
      </TreeContainer>
    </StyledSidebar>
  );
});

export default ExplorerTree;
