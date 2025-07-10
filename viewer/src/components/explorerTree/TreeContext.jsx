import React, { createContext, useContext } from 'react';
import useStore from '../../stores/store';

const TreeContext = createContext();

export const useTreeContext = () => {
  const context = useContext(TreeContext);
  if (!context) {
    throw new Error('useTreeContext must be used within TreeProvider');
  }
  return context;
};

export const TreeProvider = ({ children }) => {
  // Get all the necessary data and functions from the store
  const sourcesMetadata = useStore(state => state.sourcesMetadata);
  const loadingStates = useStore(state => state.loadingStates);
  const loadSources = useStore(state => state.loadSources);
  const loadDatabases = useStore(state => state.loadDatabases);
  const loadSchemas = useStore(state => state.loadSchemas);
  const loadTables = useStore(state => state.loadTables);
  const loadColumns = useStore(state => state.loadColumns);
  const setInfo = useStore(state => state.setInfo);

  const value = {
    sourcesMetadata,
    loadingStates,
    loadSources,
    loadDatabases,
    loadSchemas,
    loadTables,
    loadColumns,
    setInfo,
  };

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
};
