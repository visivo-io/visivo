import React from 'react';
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

  const dbLabel = (
    <ItemLabel>
      <ItemIcon>
        <FolderIcon fontSize="small" />
      </ItemIcon>
      <ItemName title={database.name}>{database.name}</ItemName>
      {(isLoadingSchemas || isLoadingTables) && <CircularProgress size={12} />}
    </ItemLabel>
  );

  return (
    <TreeItem itemId={nodeId} label={dbLabel}>
      {schemaData ? (
        schemaData.has_schemas ? (
          // Database has schemas
          schemaData.schemas?.map(schema => (
            <SchemaNode
              key={schema.name}
              schema={schema}
              sourceName={sourceName}
              databaseName={database.name}
            />
          ))
        ) : // Database has no schemas - render tables directly
        tables?.error ? (
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
        ) : Array.isArray(tables) ? (
          tables.map(table => (
            <TableNode
              key={table.name}
              table={table}
              sourceName={sourceName}
              databaseName={database.name}
              schemaName={null}
            />
          ))
        ) : (
          isLoadingTables && (
            <TreeItem
              itemId={`${nodeId}-loading`}
              label={<LoadingLabel>Loading tables...</LoadingLabel>}
            />
          )
        )
      ) : (
        // Schema data not loaded yet
        isLoadingSchemas && (
          <TreeItem
            itemId={`${nodeId}-loading`}
            label={
              <ItemLabel>
                <CircularProgress size={14} />
                <LoadingLabel>Loading...</LoadingLabel>
              </ItemLabel>
            }
          />
        )
      )}
    </TreeItem>
  );
};

export default DatabaseNode;
