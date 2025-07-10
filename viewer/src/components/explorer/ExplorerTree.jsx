import React, { useEffect } from 'react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import Pill from '../common/Pill';
import { Sidebar } from '../styled/Sidebar';
import useStore from '../../stores/store';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CircularProgress from '@mui/material/CircularProgress';

const ExplorerTree = React.memo(({ data, selectedTab, onTypeChange, onItemClick }) => {
  const { setInfo } = useStore();
  
  // Lazy-loading state and methods
  const sourcesMetadata = useStore(state => state.sourcesMetadata);
  const loadingStates = useStore(state => state.loadingStates);
  const loadSources = useStore(state => state.loadSources);
  const loadDatabases = useStore(state => state.loadDatabases);
  const loadSchemas = useStore(state => state.loadSchemas);
  const loadTables = useStore(state => state.loadTables);
  const loadColumns = useStore(state => state.loadColumns);
  
  const [expandedNodes, setExpandedNodes] = React.useState([]);
  
  // Load sources when Sources tab is selected
  useEffect(() => {
    if (selectedTab === 'sources') {
      console.log('Loading sources for Sources tab...');
      loadSources();
    }
  }, [selectedTab, loadSources]);
  
  // Debug log the sources metadata
  useEffect(() => {
    console.log('Sources metadata:', sourcesMetadata);
    console.log('Loading states:', loadingStates);
  }, [sourcesMetadata, loadingStates]);

  const validData = React.useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(item => item && typeof item === 'object' && item.name);
  }, [data]);

  const handleCopyName = React.useCallback(
    (e, name) => {
      e.stopPropagation();
      setInfo(`Copied "${name}" to clipboard`);
      navigator.clipboard.writeText(name);
    },
    [setInfo]
  );
  
  const handleNodeToggle = React.useCallback(
    async (_, itemIds) => {
      setExpandedNodes(itemIds);
      
      // Find newly expanded nodes
      const newlyExpanded = itemIds.filter(id => !expandedNodes.includes(id));
      
      for (const itemId of newlyExpanded) {
        const parts = itemId.split('-');
        
        switch (parts[0]) {
          case 'src': {
            // Expanding a source - load databases
            const srcIdx = parseInt(parts[1]);
            const sourceName = sourcesMetadata.sources[srcIdx]?.name;
            if (sourceName) {
              await loadDatabases(sourceName);
            }
            break;
          }
          case 'db': {
            // Expanding a database - check if it has schemas  
            const srcIdx = parseInt(parts[1]);
            const sourceName = sourcesMetadata.sources[srcIdx]?.name;
            const dbIdx = parseInt(parts[2]);
            const databases = sourcesMetadata.loadedDatabases[sourceName];
            const dbName = databases?.[dbIdx]?.name;
            
            if (sourceName && dbName) {
              await loadSchemas(sourceName, dbName);
              
              // If no schemas, load tables directly
              const key = `${sourceName}.${dbName}`;
              const schemaData = sourcesMetadata.loadedSchemas[key];
              if (schemaData && !schemaData.has_schemas) {
                await loadTables(sourceName, dbName);
              }
            }
            break;
          }
          case 'schema': {
            // Expanding a schema - load tables
            const srcIdx = parseInt(parts[1]);
            const sourceName = sourcesMetadata.sources[srcIdx]?.name;
            const dbIdx = parseInt(parts[2]);
            const databases = sourcesMetadata.loadedDatabases[sourceName];
            const dbName = databases?.[dbIdx]?.name;
            const schemaIdx = parseInt(parts[3]);
            const schemas = sourcesMetadata.loadedSchemas[`${sourceName}.${dbName}`]?.schemas;
            const schemaName = schemas?.[schemaIdx]?.name;
            
            if (sourceName && dbName && schemaName) {
              await loadTables(sourceName, dbName, schemaName);
            }
            break;
          }
          case 'table': {
            // Expanding a table - load columns
            const srcIdx = parseInt(parts[1]);
            const sourceName = sourcesMetadata.sources[srcIdx]?.name;
            const dbIdx = parseInt(parts[2]);
            const databases = sourcesMetadata.loadedDatabases[sourceName];
            const dbName = databases?.[dbIdx]?.name;
            
            if (parts.length >= 5) {
              // Has schema
              const schemaIdx = parseInt(parts[3]);
              const schemas = sourcesMetadata.loadedSchemas[`${sourceName}.${dbName}`]?.schemas;
              const schemaName = schemas?.[schemaIdx]?.name;
              const tableIdx = parseInt(parts[4]);
              const tables = sourcesMetadata.loadedTables[`${sourceName}.${dbName}.${schemaName}`];
              const tableName = tables?.[tableIdx]?.name;
              
              if (sourceName && dbName && schemaName && tableName) {
                await loadColumns(sourceName, dbName, tableName, schemaName);
              }
            } else {
              // No schema
              const tableIdx = parseInt(parts[3]);
              const tables = sourcesMetadata.loadedTables[`${sourceName}.${dbName}`];
              const tableName = tables?.[tableIdx]?.name;
              
              if (sourceName && dbName && tableName) {
                await loadColumns(sourceName, dbName, tableName);
              }
            }
            break;
          }
        }
      }
    },
    [expandedNodes, loadDatabases, loadSchemas, loadTables, loadColumns, sourcesMetadata.loadedSchemas]
  );

  const renderTreeItem = React.useCallback(
    node => {
      if (!node || !node.id || !node.name) return null;

      return (
        <div key={node.id} className="mb-2 mr-1 ml-1">
          <Pill name={node.name} type={node.type} onClick={() => onItemClick(node)}>
            <button onClick={e => handleCopyName(e, node.name)}>
              <HiOutlineClipboardCopy className="w-4 h-4" />
              <span className="sr-only">Copy name</span>
            </button>
          </Pill>
          {Array.isArray(node.children) && node.children.length > 0 && (
            <ul className="pl-6 mt-1">
              {node.children
                .filter(child => child && child.id && child.name)
                .map(child => renderTreeItem(child))}
            </ul>
          )}
        </div>
      );
    },
    [handleCopyName, onItemClick]
  );

  return (
    <Sidebar>
      <select
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        value={selectedTab}
        onChange={e => onTypeChange(e.target.value)}
      >
        <option value="models">SQL Models</option>
        <option value="traces">SQL Traces</option>
        <option value="sources">Sources</option>
      </select>
      {selectedTab === 'sources' ? (
        loadingStates.sources ? (
          <div className="p-4 text-center">
            <CircularProgress size={24} />
            <p className="mt-2 text-sm text-gray-600">Loading sources...</p>
          </div>
        ) : sourcesMetadata.sources && sourcesMetadata.sources.length > 0 ? (
          <SimpleTreeView
            slots={{
              collapseIcon: ExpandMoreIcon,
              expandIcon: ChevronRightIcon,
            }}
            expandedItems={expandedNodes}
            onExpandedItemsChange={handleNodeToggle}
          >
            {sourcesMetadata.sources.map((src, srcIdx) => {
              // Debug logging
              if (!src || !src.name) {
                console.error('Invalid source:', src, 'at index:', srcIdx);
                return null;
              }
              
              const itemId = `src-${srcIdx}`;
              const databases = sourcesMetadata.loadedDatabases[src.name];
              const isLoadingDatabases = loadingStates.databases[src.name];
              
              const sourceLabel = (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{src.name}</span>
                  {src.status === 'connection_failed' && (
                    <span style={{ 
                      backgroundColor: '#ef4444', 
                      color: 'white', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>
                      CONNECTION FAILED
                    </span>
                  )}
                  {src.status === 'connected' && (
                    <span style={{ 
                      backgroundColor: '#10b981', 
                      color: 'white', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>
                      CONNECTED
                    </span>
                  )}
                  {isLoadingDatabases && <CircularProgress size={14} />}
                </div>
              );
              
              return (
                <TreeItem itemId={itemId} label={sourceLabel} key={`src-${srcIdx}-${src.name}`}>
                  {src.status === 'connection_failed' && src.error ? (
                    <TreeItem
                      itemId={`src-${srcIdx}-error`}
                      label={
                        <span style={{ color: '#ef4444', fontStyle: 'italic' }}>
                          Error: {src.error}
                        </span>
                      }
                    />
                  ) : databases ? (
                    databases.map((db, dbIdx) => {
                      const dbNodeId = `db-${srcIdx}-${dbIdx}`;
                      const schemaKey = `${src.name}.${db.name}`;
                      const schemaData = sourcesMetadata.loadedSchemas[schemaKey];
                      const isLoadingSchemas = loadingStates.schemas[schemaKey];
                      
                      const dbLabel = (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{db.name}</span>
                          {isLoadingSchemas && <CircularProgress size={12} />}
                        </div>
                      );
                      
                      return (
                        <TreeItem itemId={dbNodeId} label={dbLabel} key={`${src.name}-${db.name}`}>
                          {schemaData && (
                            schemaData.has_schemas ? (
                              // Database has schemas
                              schemaData.schemas?.map((schema, schemaIdx) => {
                                const schemaNodeId = `schema-${srcIdx}-${dbIdx}-${schemaIdx}`;
                                const tableKey = `${src.name}.${db.name}.${schema.name}`;
                                const tables = sourcesMetadata.loadedTables[tableKey];
                                const isLoadingTables = loadingStates.tables[tableKey];
                                
                                const schemaLabel = (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{schema.name}</span>
                                    {isLoadingTables && <CircularProgress size={12} />}
                                  </div>
                                );
                                
                                return (
                                  <TreeItem itemId={schemaNodeId} label={schemaLabel} key={`${src.name}-${db.name}-${schema.name}`}>
                                    {tables?.map((table, tableIdx) => {
                                      const tableNodeId = `table-${srcIdx}-${dbIdx}-${schemaIdx}-${tableIdx}`;
                                      const columnKey = `${src.name}.${db.name}.${schema.name}.${table.name}`;
                                      const columns = sourcesMetadata.loadedColumns[columnKey];
                                      const isLoadingColumns = loadingStates.columns[columnKey];
                                      
                                      const tableLabel = (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span>{table.name}</span>
                                          {isLoadingColumns && <CircularProgress size={10} />}
                                        </div>
                                      );
                                      
                                      return (
                                        <TreeItem itemId={tableNodeId} label={tableLabel} key={`${src.name}-${db.name}-${schema.name}-${table.name}`}>
                                          {columns?.map((col, colIdx) => (
                                            <TreeItem
                                              itemId={`col-${srcIdx}-${dbIdx}-${schemaIdx}-${tableIdx}-${colIdx}`}
                                              label={
                                                <div style={{ fontSize: '12px' }}>
                                                  <span style={{ fontWeight: 'bold' }}>{col.name}</span>
                                                  <span style={{ color: '#666', marginLeft: '8px' }}>{col.type}</span>
                                                </div>
                                              }
                                              key={`${src.name}-${db.name}-${schema.name}-${table.name}-${col.name}`}
                                            />
                                          ))}
                                        </TreeItem>
                                      );
                                    })}
                                  </TreeItem>
                                );
                              })
                            ) : (
                              // Database has no schemas - tables at root level
                              (() => {
                                const tableKey = `${src.name}.${db.name}`;
                                const tables = sourcesMetadata.loadedTables[tableKey];
                                const isLoadingTables = loadingStates.tables[tableKey];
                                
                                return tables ? tables.map((table, tableIdx) => {
                                  const tableNodeId = `table-${srcIdx}-${dbIdx}-${tableIdx}`;
                                  const columnKey = `${src.name}.${db.name}.${table.name}`;
                                  const columns = sourcesMetadata.loadedColumns[columnKey];
                                  const isLoadingColumns = loadingStates.columns[columnKey];
                                  
                                  const tableLabel = (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span>{table.name}</span>
                                      {isLoadingColumns && <CircularProgress size={10} />}
                                    </div>
                                  );
                                  
                                  return (
                                    <TreeItem itemId={tableNodeId} label={tableLabel} key={`${src.name}-${db.name}-${table.name}`}>
                                      {columns?.map((col, colIdx) => (
                                        <TreeItem
                                          itemId={`col-${srcIdx}-${dbIdx}-${tableIdx}-${colIdx}`}
                                          label={
                                            <div style={{ fontSize: '12px' }}>
                                              <span style={{ fontWeight: 'bold' }}>{col.name}</span>
                                              <span style={{ color: '#666', marginLeft: '8px' }}>{col.type}</span>
                                            </div>
                                          }
                                          key={`${src.name}-${db.name}-${table.name}-${col.name}`}
                                        />
                                      ))}
                                    </TreeItem>
                                  );
                                }) : (
                                  isLoadingTables && (
                                    <TreeItem
                                      itemId={`db-${srcIdx}-${dbIdx}-loading`}
                                      label={
                                        <span style={{ fontStyle: 'italic', color: '#999' }}>
                                          Loading tables...
                                        </span>
                                      }
                                    />
                                  )
                                );
                              })()
                            )
                          )}
                        </TreeItem>
                      );
                    })
                  ) : (
                    !isLoadingDatabases && !src.error && (
                      <TreeItem
                        itemId={`src-${srcIdx}-empty`}
                        label={
                          <span style={{ fontStyle: 'italic', color: '#999' }}>
                            Click to load databases
                          </span>
                        }
                      />
                    )
                  )}
                </TreeItem>
              );
            }).filter(Boolean)}
          </SimpleTreeView>
        ) : (
          <div className="p-4 text-sm text-gray-500 text-center">No sources available</div>
        )
      ) : (
        validData.length > 0 ? (
          validData.map(item => renderTreeItem(item))
        ) : (
          <div className="p-4 text-sm text-gray-500 text-center">No items to display</div>
        )
      )}
    </Sidebar>
  );
});

export default ExplorerTree;
