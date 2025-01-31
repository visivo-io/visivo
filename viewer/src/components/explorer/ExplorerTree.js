import React from 'react';
import { TreeView, TreeItem } from '@mui/lab';
import { Typography, IconButton, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartIcon from '@mui/icons-material/TableChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

const ExplorerTree = ({ data, type, onItemClick }) => {
  const getIcon = () => {
    switch (type) {
      case 'sources':
        return <StorageIcon fontSize="small" />;
      case 'models':
        return <TableChartIcon fontSize="small" />;
      case 'traces':
        return <TimelineIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const handleCopyName = (e, name) => {
    e.stopPropagation();
    navigator.clipboard.writeText(name);
  };

  const renderTree = (nodes) => (
    <TreeItem
      key={nodes.id}
      nodeId={nodes.id}
      onClick={() => onItemClick(nodes)}
      label={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {getIcon()}
          <Typography variant="body2">{nodes.name}</Typography>
          <Tooltip title="Copy name">
            <IconButton
              size="small"
              onClick={(e) => handleCopyName(e, nodes.name)}
              sx={{ ml: 'auto' }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      }
    >
      {Array.isArray(nodes.children)
        ? nodes.children.map((node) => renderTree(node))
        : null}
    </TreeItem>
  );

  return (
    <TreeView
      defaultCollapseIcon={<ExpandMoreIcon />}
      defaultExpandIcon={<ChevronRightIcon />}
      sx={{ flexGrow: 1, maxWidth: '100%', overflowY: 'auto' }}
    >
      {data.map((item) => renderTree(item))}
    </TreeView>
  );
};

export default ExplorerTree; 