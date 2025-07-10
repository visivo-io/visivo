import React from 'react';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import SchemaIcon from '@mui/icons-material/Schema';
import CircularProgress from '@mui/material/CircularProgress';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { ItemLabel, ItemIcon, ItemName, LoadingLabel } from '../styles/TreeStyles';
import { createSchemaNodeId, getDataKey } from '../utils/nodeIdUtils';
import { useTreeContext } from '../TreeContext';
import TableNode from './TableNode';

const SchemaNode = ({ schema, sourceName, databaseName }) => {
  const { sourcesMetadata, loadingStates } = useTreeContext();

  const nodeId = createSchemaNodeId(sourceName, databaseName, schema.name);
  const tableKey = getDataKey.table(sourceName, databaseName, schema.name);
  const tables = sourcesMetadata.loadedTables[tableKey];
  const isLoadingTables = loadingStates.tables[tableKey];

  const schemaLabel = (
    <ItemLabel>
      <ItemIcon>
        <SchemaIcon fontSize="small" />
      </ItemIcon>
      <ItemName title={schema.name}>{schema.name}</ItemName>
      {isLoadingTables && <CircularProgress size={12} />}
    </ItemLabel>
  );

  return (
    <TreeItem itemId={nodeId} label={schemaLabel}>
      {tables?.error ? (
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
            databaseName={databaseName}
            schemaName={schema.name}
          />
        ))
      ) : isLoadingTables ? (
        <TreeItem
          itemId={`${nodeId}-loading`}
          label={
            <ItemLabel>
              <CircularProgress size={12} />
              <LoadingLabel>Loading tables...</LoadingLabel>
            </ItemLabel>
          }
        />
      ) : (
        // Not loading and no data - show placeholder to allow expansion
        <TreeItem
          itemId={`${nodeId}-placeholder`}
          label={<LoadingLabel>Click to expand</LoadingLabel>}
        />
      )}
    </TreeItem>
  );
};

export default SchemaNode;
