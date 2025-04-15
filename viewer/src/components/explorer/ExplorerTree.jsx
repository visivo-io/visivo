import React from 'react';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartIcon from '@mui/icons-material/TableChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Pill from '../styled/Pill';

const ExplorerTree = React.memo(({ data, type, onItemClick }) => {
  const validData = React.useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(item => item && typeof item === 'object' && item.name);
  }, [data]);

  const getIcon = React.useCallback(() => {
    switch (type) {
      case 'sources':
        return <StorageIcon className="w-4 h-4 text-gray-500" />;
      case 'models':
        return <TableChartIcon className="w-4 h-4 text-gray-500" />;
      case 'traces':
        return <TimelineIcon className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  }, [type]);

  const handleCopyName = React.useCallback((e, name) => {
    e.stopPropagation();
    navigator.clipboard.writeText(name);
  }, []);

  const renderTreeItem = React.useCallback((node) => {
    if (!node || !node.id || !node.name) return null;

    return (
      // <ObjectPill name={node.name} type={node.type} />
      <div key={node.id} className="mb-2 mr-1 ml-1">
        <Pill name={node.name} type={node.type} onClick={() => onItemClick(node)}>
          <button
            onClick={(e) => handleCopyName(e, node.name)}
            className="relative inline-flex items-center text-sm font-medium text-center text-gray-500 rounded-lg hover:bg-gray-200 focus:outline-hidden opacity-0 group-hover:opacity-100"
          >
            <ContentCopyIcon className="w-4 h-4" />
            <span className="sr-only">Copy name</span>
          </button>
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
  }, [getIcon, handleCopyName, onItemClick]);

  if (!validData.length) {
    return (
      <div className="p-4 text-sm text-gray-500 text-center">
        No items to display
      </div>
    );
  }

  return (
      <div className="overflow-y-auto flex-1">
        {validData.map(item => renderTreeItem(item))}
      </div>
  );
});

export default ExplorerTree; 