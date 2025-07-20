import React from 'react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import Pill from '../common/Pill';
import { CopyButton, EmptyMessage } from './styles/TreeStyles';
import useStore from '../../stores/store';

const ModelsTracesList = ({ data, onItemClick }) => {
  const { setInfo } = useStore();

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
            <CopyButton onClick={e => handleCopyName(e, node.name)}>
              <HiOutlineClipboardCopy className="w-4 h-4" />
              <span className="sr-only">Copy name</span>
            </CopyButton>
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

  const validData = React.useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(item => item && typeof item === 'object' && item.name);
  }, [data]);

  if (validData.length === 0) {
    return <EmptyMessage>No items to display</EmptyMessage>;
  }

  return <>{validData.map(item => renderTreeItem(item))}</>;
};

export default ModelsTracesList;
