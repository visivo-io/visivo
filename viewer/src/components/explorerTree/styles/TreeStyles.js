import { styled } from '@mui/material/styles';
import { Sidebar } from '../../styled/Sidebar';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';

export const StyledSidebar = styled(Sidebar)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

export const SelectContainer = styled('div')`
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
`;

export const TreeContainer = styled('div')`
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

export const StyledTreeView = styled(SimpleTreeView)`
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

  .MuiTreeItem-group {
    margin-left: 0;
  }
`;

export const ItemLabel = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 2px 0;
`;

export const ItemIcon = styled('span')`
  display: flex;
  align-items: center;
  color: #6b7280;
`;

export const ItemName = styled('span')`
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const StatusIcon = styled('span')`
  display: flex;
  align-items: center;
  margin-left: 4px;
`;

export const ColumnInfo = styled('div')`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
`;

export const ColumnName = styled('span')`
  font-weight: 600;
  color: #1f2937;
`;

export const ColumnType = styled('span')`
  color: #6b7280;
  font-family: 'Courier New', monospace;
  font-size: 12px;
`;

export const LoadingLabel = styled('span')`
  font-style: italic;
  color: #9ca3af;
  font-size: 13px;
`;

export const EmptyMessage = styled('div')`
  padding: 24px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
`;

export const CopyButton = styled('button')`
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
