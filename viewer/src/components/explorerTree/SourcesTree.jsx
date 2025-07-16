import React, { useEffect } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { TreeProvider, useTreeContext } from './TreeContext';
import { useTreeExpansion } from './hooks/useTreeExpansion';
import { StyledTreeView, EmptyMessage } from './styles/TreeStyles';
import SourceNode from './components/SourceNode';
import useStore from '../../stores/store';

const SourcesTreeContent = () => {
  const { sourcesMetadata, loadingStates, loadSources } = useTreeContext();
  const { expandedNodes, handleNodeToggle } = useTreeExpansion();
  const namedChildren = useStore(state => state.namedChildren);

  // Load sources when component mounts or when namedChildren changes
  useEffect(() => {
    if (namedChildren && Object.keys(namedChildren).length > 0) {
      loadSources();
    }
  }, [loadSources, namedChildren]);

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
