import React from 'react';
import { StyledSidebar, SelectContainer, TreeContainer } from './styles/TreeStyles';
import ModelsTracesList from './ModelsTracesList';
import SourcesTree from './SourcesTree';

const ExplorerTree = React.memo(({ data, selectedTab, onTypeChange, onItemClick }) => {
  return (
    <StyledSidebar>
      <SelectContainer>
        <select
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedTab}
          onChange={e => onTypeChange(e.target.value)}
        >
          <option value="models">SQL Models</option>
          <option value="traces">SQL Traces</option>
          <option value="sources">Sources</option>
        </select>
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
