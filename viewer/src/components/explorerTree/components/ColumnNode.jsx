import React from 'react';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { ColumnInfo, ItemIcon, ColumnName, ColumnType } from '../styles/TreeStyles';
import { createColumnNodeId } from '../utils/nodeIdUtils';

const ColumnNode = ({ column, sourceName, databaseName, schemaName, tableName }) => {
  const nodeId = createColumnNodeId(sourceName, databaseName, schemaName, tableName, column.name);

  const columnLabel = (
    <ColumnInfo>
      <ItemIcon>
        <ViewColumnIcon fontSize="small" />
      </ItemIcon>
      <ColumnName>{column.name}</ColumnName>
      <ColumnType>{column.type}</ColumnType>
    </ColumnInfo>
  );

  return (
    <TreeItem
      itemId={nodeId}
      label={columnLabel}
      sx={{
        '& > .MuiTreeItem-content': {
          paddingLeft: '96px',
        },
      }}
    />
  );
};

export default ColumnNode;
