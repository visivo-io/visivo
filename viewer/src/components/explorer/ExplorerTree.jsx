import React from 'react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import Pill from '../common/Pill';
import { Sidebar } from '../styled/Sidebar';
import useExplorerStore from '../../stores/explorerStore';

const ExplorerTree = React.memo(({ data, selectedTab, onTypeChange, onItemClick }) => {
  const { setInfo } = useExplorerStore();

  const validData = React.useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(item => item && typeof item === 'object' && item.name);
  }, [data]);

  const handleCopyName = React.useCallback(
    (e, name) => {
      e.stopPropagation();
      setInfo(`Copied "${name}" to clipboard`);
      navigator.clipboard.writeText(name);
    },
    [setInfo]
  );

  const renderTreeItem = React.useCallback(
    node => {
      if (!node || !node.id || !node.name) return null;

      return (
        <div key={node.id} className="mb-2 mr-1 ml-1">
          <Pill name={node.name} type={node.type} onClick={() => onItemClick(node)}>
            <button onClick={e => handleCopyName(e, node.name)}>
              <HiOutlineClipboardCopy className="w-4 h-4" />
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
    },
    [handleCopyName, onItemClick]
  );

  if (!validData.length) {
    return <div className="p-4 text-sm text-gray-500 text-center">No items to display</div>;
  }

  return (
    <Sidebar>
      <select
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        value={selectedTab}
        onChange={e => onTypeChange(e.target.value)}
      >
        <option value="models">SQL Models</option>
        <option value="traces">SQL Traces</option>
      </select>
      {validData.map(item => renderTreeItem(item))}
    </Sidebar>
  );
});

export default ExplorerTree;
