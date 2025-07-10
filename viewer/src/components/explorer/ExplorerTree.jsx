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
import StorageIcon from '@mui/icons-material/Storage';
import FolderIcon from '@mui/icons-material/Folder';
import SchemaIcon from '@mui/icons-material/Schema';
import TableChartIcon from '@mui/icons-material/TableChart';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { styled } from '@mui/material/styles';

// Styled components for better UI
const StyledSidebar = styled(Sidebar)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

const SelectContainer = styled('div')`
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
`;

const TreeContainer = styled('div')`
  flex: 1;
  overflow: auto;
  padding: 12px;
  
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: #f3f4f6;
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
`;

const StyledTreeView = styled(SimpleTreeView)`
  .MuiTreeItem-content {
    padding: 4px 8px;
    margin: 2px 0;
    border-radius: 4px;
    
    &:hover {
      background-color: #f3f4f6;
    }
    
    &.Mui-selected {
      background-color: #e0e7ff;
      
      &:hover {
        background-color: #c7d2fe;
      }
    }
  }
  
  .MuiTreeItem-label {
    font-size: 14px;
    color: #374151;
  }
`;

const ItemLabel = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 2px 0;
`;

const ItemIcon = styled('span')`
  display: flex;
  align-items: center;
  color: #6b7280;
`;

const ItemName = styled('span')`
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StatusBadge = styled('span')`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
  
  &.connected {
    background-color: #d1fae5;
    color: #059669;
  }
  
  &.failed {
    background-color: #fee2e2;
    color: #dc2626;
  }
`;

const ColumnInfo = styled('div')`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
`;

const ColumnName = styled('span')`
  font-weight: 600;
  color: #1f2937;
`;

const ColumnType = styled('span')`
  color: #6b7280;
  font-family: 'Courier New', monospace;
  font-size: 12px;
`;

const LoadingLabel = styled('span')`
  font-style: italic;
  color: #9ca3af;
  font-size: 13px;
`;

const EmptyMessage = styled('div')`
  padding: 24px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
`;

const CopyButton = styled('button')`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6b7280;
  
  &:hover {
    background-color: #e5e7eb;
    color: #374151;
  }
`;

// Subcomponents
const SourceTreeItem = ({ source, srcIdx, isLoadingDatabases, children }) => {
  const sourceLabel = (
    <ItemLabel>
      <ItemIcon><StorageIcon fontSize="small" /></ItemIcon>
      <ItemName title={source.name}>{source.name}</ItemName>
      {source.status === 'connection_failed' && (
        <StatusBadge className="failed">Failed</StatusBadge>
      )}
      {source.status === 'connected' && (
        <StatusBadge className="connected">Connected</StatusBadge>
      )}
      {isLoadingDatabases && <CircularProgress size={14} />}
    </ItemLabel>
  );
  
  return (
    <TreeItem itemId={`src-${srcIdx}`} label={sourceLabel}>
      {children}
    </TreeItem>
  );
};

const DatabaseTreeItem = ({ database, dbNodeId, isLoadingSchemas, children }) => {
  const dbLabel = (
    <ItemLabel>
      <ItemIcon><FolderIcon fontSize="small" /></ItemIcon>
      <ItemName title={database.name}>{database.name}</ItemName>
      {isLoadingSchemas && <CircularProgress size={12} />}
    </ItemLabel>
  );
  
  return (
    <TreeItem itemId={dbNodeId} label={dbLabel}>
      {children}
    </TreeItem>
  );
};

const SchemaTreeItem = ({ schema, schemaNodeId, isLoadingTables, children }) => {
  const schemaLabel = (
    <ItemLabel>
      <ItemIcon><SchemaIcon fontSize="small" /></ItemIcon>
      <ItemName title={schema.name}>{schema.name}</ItemName>
      {isLoadingTables && <CircularProgress size={12} />}
    </ItemLabel>
  );
  
  return (
    <TreeItem itemId={schemaNodeId} label={schemaLabel}>
      {children}
    </TreeItem>
  );
};

const TableTreeItem = ({ table, tableNodeId, isLoadingColumns, children }) => {
  const tableLabel = (
    <ItemLabel>
      <ItemIcon><TableChartIcon fontSize="small" /></ItemIcon>
      <ItemName title={table.name}>{table.name}</ItemName>
      {isLoadingColumns && <CircularProgress size={10} />}
    </ItemLabel>
  );
  
  return (
    <TreeItem itemId={tableNodeId} label={tableLabel}>
      {children}
    </TreeItem>
  );
};

const ColumnTreeItem = ({ column, columnNodeId }) => {
  const columnLabel = (
    <ColumnInfo>
      <ItemIcon><ViewColumnIcon fontSize="small" /></ItemIcon>
      <ColumnName>{column.name}</ColumnName>
      <ColumnType>{column.type}</ColumnType>
    </ColumnInfo>
  );
  
  return <TreeItem itemId={columnNodeId} label={columnLabel} />;
};

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
      loadSources();
    }
  }, [selectedTab, loadSources]);

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
    async (_, nodeIds) => {
      setExpandedNodes(nodeIds);
      
      // Find newly expanded nodes
      const newlyExpanded = nodeIds.filter(id => !expandedNodes.includes(id));
      
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
    [expandedNodes, loadDatabases, loadSchemas, loadTables, loadColumns, sourcesMetadata.sources, sourcesMetadata.loadedDatabases, sourcesMetadata.loadedSchemas, sourcesMetadata.loadedTables]
  );

  const renderTreeItem = React.useCallback(
    node => {
      if (!node || !node.id || !node.name) return null;

      return (
        <div key={node.id} className="mb-2 mr-1 ml-1">
          <Pill name={node.name} type={node.type} onClick={() => onItemClick(node)}>
            <CopyButton onClick={e => handleCopyName(e, node.name)}>
              <HiOutlineClipboardCopy className="w-4 h-4" />
              <span className="sr-only">Copy name</span>
            </CopyButton>
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
          loadingStates.sources ? (
            <EmptyMessage>
              <CircularProgress size={24} />
              <p className="mt-2">Loading sources...</p>
            </EmptyMessage>
          ) : sourcesMetadata.sources && sourcesMetadata.sources.length > 0 ? (
            <StyledTreeView
              slots={{
                collapseIcon: ExpandMoreIcon,
                expandIcon: ChevronRightIcon,
              }}
              expanded={expandedNodes}
              onExpandedItemsChange={handleNodeToggle}
            >
              {sourcesMetadata.sources.map((src, srcIdx) => {
                if (!src || !src.name) return null;
                
                const databases = sourcesMetadata.loadedDatabases[src.name];
                const isLoadingDatabases = loadingStates.databases[src.name];
                
                return (
                  <SourceTreeItem
                    key={`src-${srcIdx}-${src.name}`}
                    source={src}
                    srcIdx={srcIdx}
                    isLoadingDatabases={isLoadingDatabases}
                  >
                    {src.status === 'connection_failed' && src.error ? (
                      <TreeItem
                        itemId={`src-${srcIdx}-error`}
                        label={
                          <ItemLabel>
                            <ItemIcon><ErrorOutlineIcon fontSize="small" color="error" /></ItemIcon>
                            <span style={{ color: '#dc2626', fontSize: '13px' }}>
                              {src.error}
                            </span>
                          </ItemLabel>
                        }
                      />
                    ) : databases ? (
                      databases.map((db, dbIdx) => {
                        const dbNodeId = `db-${srcIdx}-${dbIdx}`;
                        const schemaKey = `${src.name}.${db.name}`;
                        const schemaData = sourcesMetadata.loadedSchemas[schemaKey];
                        const isLoadingSchemas = loadingStates.schemas[schemaKey];
                        
                        return (
                          <DatabaseTreeItem
                            key={`${src.name}-${db.name}`}
                            database={db}
                            dbNodeId={dbNodeId}
                            isLoadingSchemas={isLoadingSchemas}
                          >
                            {schemaData ? (
                              schemaData.has_schemas ? (
                                // Database has schemas
                                schemaData.schemas?.map((schema, schemaIdx) => {
                                  const schemaNodeId = `schema-${srcIdx}-${dbIdx}-${schemaIdx}`;
                                  const tableKey = `${src.name}.${db.name}.${schema.name}`;
                                  const tables = sourcesMetadata.loadedTables[tableKey];
                                  const isLoadingTables = loadingStates.tables[tableKey];
                                  
                                  return (
                                    <SchemaTreeItem
                                      key={`${src.name}-${db.name}-${schema.name}`}
                                      schema={schema}
                                      schemaNodeId={schemaNodeId}
                                      isLoadingTables={isLoadingTables}
                                    >
                                      {tables?.error ? (
                                        <TreeItem
                                          itemId={`schema-${srcIdx}-${dbIdx}-${schemaIdx}-error`}
                                          label={
                                            <ItemLabel>
                                              <ItemIcon><ErrorOutlineIcon fontSize="small" color="error" /></ItemIcon>
                                              <span style={{ color: '#dc2626', fontSize: '13px' }}>
                                                Connection failed
                                              </span>
                                            </ItemLabel>
                                          }
                                        />
                                      ) : Array.isArray(tables) ? tables.map((table, tableIdx) => {
                                        const tableNodeId = `table-${srcIdx}-${dbIdx}-${schemaIdx}-${tableIdx}`;
                                        const columnKey = `${src.name}.${db.name}.${schema.name}.${table.name}`;
                                        const columns = sourcesMetadata.loadedColumns[columnKey];
                                        const isLoadingColumns = loadingStates.columns[columnKey];
                                        
                                        return (
                                          <TableTreeItem
                                            key={`${src.name}-${db.name}-${schema.name}-${table.name}`}
                                            table={table}
                                            tableNodeId={tableNodeId}
                                            isLoadingColumns={isLoadingColumns}
                                          >
                                            {columns?.map((col, colIdx) => (
                                              <ColumnTreeItem
                                                key={`${src.name}-${db.name}-${schema.name}-${table.name}-${col.name}`}
                                                column={col}
                                                columnNodeId={`col-${srcIdx}-${dbIdx}-${schemaIdx}-${tableIdx}-${colIdx}`}
                                              />
                                            ))}
                                          </TableTreeItem>
                                        );
                                      }) : null}
                                    </SchemaTreeItem>
                                  );
                                })
                              ) : (
                                // Database has no schemas - tables at root level
                                (() => {
                                  const tableKey = `${src.name}.${db.name}`;
                                  const tables = sourcesMetadata.loadedTables[tableKey];
                                  const isLoadingTables = loadingStates.tables[tableKey];
                                  
                                  return tables?.error ? (
                                    <TreeItem
                                      itemId={`db-${srcIdx}-${dbIdx}-error`}
                                      label={
                                        <ItemLabel>
                                          <ItemIcon><ErrorOutlineIcon fontSize="small" color="error" /></ItemIcon>
                                          <span style={{ color: '#dc2626', fontSize: '13px' }}>
                                            Connection failed
                                          </span>
                                        </ItemLabel>
                                      }
                                    />
                                  ) : Array.isArray(tables) ? tables.map((table, tableIdx) => {
                                    const tableNodeId = `table-${srcIdx}-${dbIdx}-${tableIdx}`;
                                    const columnKey = `${src.name}.${db.name}.${table.name}`;
                                    const columns = sourcesMetadata.loadedColumns[columnKey];
                                    const isLoadingColumns = loadingStates.columns[columnKey];
                                    
                                    return (
                                      <TableTreeItem
                                        key={`${src.name}-${db.name}-${table.name}`}
                                        table={table}
                                        tableNodeId={tableNodeId}
                                        isLoadingColumns={isLoadingColumns}
                                      >
                                        {columns?.map((col, colIdx) => (
                                          <ColumnTreeItem
                                            key={`${src.name}-${db.name}-${table.name}-${col.name}`}
                                            column={col}
                                            columnNodeId={`col-${srcIdx}-${dbIdx}-${tableIdx}-${colIdx}`}
                                          />
                                        ))}
                                      </TableTreeItem>
                                    );
                                  }) : (
                                    isLoadingTables && (
                                      <TreeItem
                                        itemId={`db-${srcIdx}-${dbIdx}-loading`}
                                        label={<LoadingLabel>Loading tables...</LoadingLabel>}
                                      />
                                    )
                                  );
                                })()
                              )
                            ) : null}
                          </DatabaseTreeItem>
                        );
                      })
                    ) : (
                      !isLoadingDatabases && !src.error && (
                        <TreeItem
                          itemId={`src-${srcIdx}-empty`}
                          label={<LoadingLabel>Click to load databases</LoadingLabel>}
                        />
                      )
                    )}
                  </SourceTreeItem>
                );
              }).filter(Boolean)}
            </StyledTreeView>
          ) : (
            <EmptyMessage>No sources available</EmptyMessage>
          )
        ) : (
          validData.length > 0 ? (
            validData.map(item => renderTreeItem(item))
          ) : (
            <EmptyMessage>No items to display</EmptyMessage>
          )
        )}
      </TreeContainer>
    </StyledSidebar>
  );
});

export default ExplorerTree;