import React, { useEffect } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { TreeProvider, useTreeContext } from './TreeContext';
import { useTreeExpansion } from './hooks/useTreeExpansion';
import { StyledTreeView, EmptyMessage } from './styles/TreeStyles';
import SourceNode from './components/SourceNode';

const SourcesTreeContent = () => {
  const { sourcesMetadata, loadingStates, loadSources } = useTreeContext();
  const { expandedNodes, handleNodeToggle } = useTreeExpansion();

  // Load sources when component mounts
  useEffect(() => {
    loadSources();
  }, [loadSources]);

  if (loadingStates.sources) {
    return (
      <EmptyMessage>
        <CircularProgress size={24} />
        <p className="mt-2">Loading sources...</p>
      </EmptyMessage>
    );
  }

  if (!sourcesMetadata.sources || sourcesMetadata.sources.length === 0) {
    return <EmptyMessage>No sources available</EmptyMessage>;
  }

  return (
    <StyledTreeView
      slots={{
        collapseIcon: ExpandMoreIcon,
        expandIcon: ChevronRightIcon,
      }}
      expandedItems={expandedNodes}
      onExpandedItemsChange={handleNodeToggle}
    >
      {sourcesMetadata.sources
        .filter(src => src && src.name)
        .map(source => (
          <SourceNode key={source.name} source={source} />
        ))}
    </StyledTreeView>
  );
};

const SourcesTree = () => {
  return (
    <TreeProvider>
      <SourcesTreeContent />
    </TreeProvider>
  );
};

export default SourcesTree;
