import React, { useEffect } from 'react';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import FolderIcon from '@mui/icons-material/Folder';
import CircularProgress from '@mui/material/CircularProgress';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { ItemLabel, ItemIcon, ItemName, LoadingLabel } from '../styles/TreeStyles';
import { createDatabaseNodeId, getDataKey } from '../utils/nodeIdUtils';
import { useTreeContext } from '../TreeContext';
import SchemaNode from './SchemaNode';
import TableNode from './TableNode';

const DatabaseNode = ({ database, sourceName }) => {
  const { sourcesMetadata, loadingStates } = useTreeContext();

  const nodeId = createDatabaseNodeId(sourceName, database.name);
  const schemaKey = getDataKey.schema(sourceName, database.name);
  const schemaData = sourcesMetadata.loadedSchemas[schemaKey];
  const isLoadingSchemas = loadingStates.schemas[schemaKey];

  // For databases without schemas, check tables directly
  const tableKey = getDataKey.table(sourceName, database.name, null);
  const tables = sourcesMetadata.loadedTables[tableKey];
  const isLoadingTables = loadingStates.tables[tableKey];

  // Debug logging
  useEffect(() => {
    console.log(`DatabaseNode render:`, {
      database: database.name,
      sourceName,
      nodeId,
      schemaKey,
      schemaData,
      isLoadingSchemas,
      tableKey,
      tables,
      isLoadingTables,
    });
  }, [
    database.name,
    sourceName,
    nodeId,
    schemaKey,
    schemaData,
    isLoadingSchemas,
    tableKey,
    tables,
    isLoadingTables,
  ]);

  const dbLabel = (
    <ItemLabel>
      <ItemIcon>
        <FolderIcon fontSize="small" />
      </ItemIcon>
      <ItemName title={database.name}>{database.name}</ItemName>
      {(isLoadingSchemas || isLoadingTables) && <CircularProgress size={12} />}
    </ItemLabel>
  );

  const renderChildren = () => {
    console.log(`DatabaseNode renderChildren:`, {
      schemaData,
      hasSchemas: schemaData?.has_schemas,
      schemas: schemaData?.schemas,
      tables,
      isLoadingSchemas,
      isLoadingTables,
    });

    if (schemaData) {
      if (schemaData.has_schemas) {
        // Database has schemas
        return schemaData.schemas?.map(schema => (
          <SchemaNode
            key={schema.name}
            schema={schema}
            sourceName={sourceName}
            databaseName={database.name}
          />
        ));
      } else {
        // Database has no schemas - render tables directly
        if (tables?.error) {
          return (
            <TreeItem
              itemId={`${nodeId}-error`}
              label={
                <ItemLabel>
                  <ItemIcon>
                    <ErrorOutlineIcon fontSize="small" color="error" />
                  </ItemIcon>
                  <span style={{ color: '#dc2626', fontSize: '13px' }}>Connection failed</span>
                </ItemLabel>
              }
            />
          );
        } else if (Array.isArray(tables)) {
          return tables.map(table => (
            <TableNode
              key={table.name}
              table={table}
              sourceName={sourceName}
              databaseName={database.name}
              schemaName={null}
            />
          ));
        } else if (isLoadingTables) {
          return (
            <TreeItem
              itemId={`${nodeId}-loading`}
              label={<LoadingLabel>Loading tables...</LoadingLabel>}
            />
          );
        }
      }
    } else if (isLoadingSchemas) {
      // Schema data not loaded yet
      return (
        <TreeItem
          itemId={`${nodeId}-loading`}
          label={
            <ItemLabel>
              <CircularProgress size={14} />
              <LoadingLabel>Loading...</LoadingLabel>
            </ItemLabel>
          }
        />
      );
    } else {
      // Not loading and no data - show placeholder to allow expansion
      return (
        <TreeItem
          itemId={`${nodeId}-placeholder`}
          label={<LoadingLabel>Click to expand</LoadingLabel>}
        />
      );
    }
  };

  return (
    <TreeItem itemId={nodeId} label={dbLabel}>
      {renderChildren()}
    </TreeItem>
  );
};

export default DatabaseNode;
