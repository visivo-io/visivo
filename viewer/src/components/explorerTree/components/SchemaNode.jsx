import React from 'react';
import SchemaIcon from '@mui/icons-material/Schema';
import CircularProgress from '@mui/material/CircularProgress';
import { ItemLabel, ItemIcon, ItemName } from '../styles/TreeStyles';
import { createSchemaNodeId, getDataKey } from '../utils/nodeIdUtils';
import { useTreeContext } from '../TreeContext';
import TableNode from './TableNode';
import TreeNodeWrapper from './TreeNodeWrapper';

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

  // Determine what to render based on state
  let children = null;
  let isLoading = isLoadingTables;
  let error = tables?.error || null;

  if (Array.isArray(tables)) {
    children = tables.map(table => (
      <TableNode
        key={table.name}
        table={table}
        sourceName={sourceName}
        databaseName={databaseName}
        schemaName={schema.name}
      />
    ));
  }

  return (
    <TreeNodeWrapper
      nodeId={nodeId}
      label={schemaLabel}
      isLoading={isLoading}
      error={error}
      loadingText="Loading tables..."
      sx={{
        '& > .MuiTreeItem-content': {
          paddingLeft: '48px',
        },
      }}
    >
      {children}
    </TreeNodeWrapper>
  );
};

export default SchemaNode;
