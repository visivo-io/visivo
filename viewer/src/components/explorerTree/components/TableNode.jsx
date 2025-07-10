import React from 'react';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import TableChartIcon from '@mui/icons-material/TableChart';
import CircularProgress from '@mui/material/CircularProgress';
import { ItemLabel, ItemIcon, ItemName, LoadingLabel } from '../styles/TreeStyles';
import { createTableNodeId, getDataKey } from '../utils/nodeIdUtils';
import { useTreeContext } from '../TreeContext';
import ColumnNode from './ColumnNode';

const TableNode = ({ table, sourceName, databaseName, schemaName }) => {
  const { sourcesMetadata, loadingStates } = useTreeContext();

  const nodeId = createTableNodeId(sourceName, databaseName, schemaName, table.name);
  const columnKey = getDataKey.column(sourceName, databaseName, schemaName, table.name);
  const columns = sourcesMetadata.loadedColumns[columnKey];
  const isLoadingColumns = loadingStates.columns[columnKey];

  const tableLabel = (
    <ItemLabel>
      <ItemIcon>
        <TableChartIcon fontSize="small" />
      </ItemIcon>
      <ItemName title={table.name}>{table.name}</ItemName>
      {isLoadingColumns && <CircularProgress size={10} />}
    </ItemLabel>
  );

  return (
    <TreeItem itemId={nodeId} label={tableLabel}>
      {isLoadingColumns ? (
        <TreeItem
          itemId={`${nodeId}-loading`}
          label={
            <ItemLabel>
              <CircularProgress size={10} />
              <LoadingLabel>Loading columns...</LoadingLabel>
            </ItemLabel>
          }
        />
      ) : columns && columns.length > 0 ? (
        columns.map(col => (
          <ColumnNode
            key={col.name}
            column={col}
            sourceName={sourceName}
            databaseName={databaseName}
            schemaName={schemaName}
            tableName={table.name}
          />
        ))
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

export default TableNode;
