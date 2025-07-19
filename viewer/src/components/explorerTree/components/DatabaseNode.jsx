import React from 'react';
import { HiOutlineDatabase } from 'react-icons/hi';
import CircularProgress from '@mui/material/CircularProgress';
import { ItemLabel, ItemIcon, ItemName } from '../styles/TreeStyles';
import { createDatabaseNodeId, getDataKey } from '../utils/nodeIdUtils';
import { useTreeContext } from '../TreeContext';
import SchemaNode from './SchemaNode';
import TableNode from './TableNode';
import TreeNodeWrapper from './TreeNodeWrapper';

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
        <HiOutlineDatabase size={20} />
      </ItemIcon>
      <ItemName title={database.name}>{database.name}</ItemName>
      {(isLoadingSchemas || isLoadingTables) && <CircularProgress size={12} />}
    </ItemLabel>
  );

  // Determine what to render based on state
  let children = null;
  let isLoading = false;
  let error = null;

  if (schemaData) {
    if (schemaData.has_schemas) {
      // Database has schemas
      children = schemaData.schemas?.map(schema => (
        <SchemaNode
          key={schema.name}
          schema={schema}
          sourceName={sourceName}
          databaseName={database.name}
        />
      ));
    } else {
      // Database has no schemas - check tables directly
      if (tables?.error) {
        error = tables.error;
      } else if (Array.isArray(tables)) {
        children = tables.map(table => (
          <TableNode
            key={table.name}
            table={table}
            sourceName={sourceName}
            databaseName={database.name}
            schemaName={null}
          />
        ));
      } else {
        isLoading = isLoadingTables;
      }
    }
  } else {
    // Schema data not loaded yet
    isLoading = isLoadingSchemas;
  }

  return (
    <TreeNodeWrapper
      nodeId={nodeId}
      label={dbLabel}
      isLoading={isLoading}
      error={error}
      loadingText={isLoadingSchemas ? 'Loading schemas...' : 'Loading tables...'}
    >
      {children}
    </TreeNodeWrapper>
  );
};

export default DatabaseNode;
