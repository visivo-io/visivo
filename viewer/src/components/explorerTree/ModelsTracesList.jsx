import React, { useState } from 'react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import Pill from '../common/Pill';
import { CopyButton, EmptyMessage } from './styles/TreeStyles';
import useStore from '../../stores/store';
import ExplorerContextMenu from './ExplorerContextMenu';
import RenameDialog from './RenameDialog';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';

const ModelsTracesList = ({ data, onItemClick }) => {
  const { setInfo, renameNamedChild, deleteNamedChild, writeModifiedFiles, namedChildren } =
    useStore();

  const [contextMenu, setContextMenu] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const handleCopyName = React.useCallback(
    (e, name) => {
      e.stopPropagation();
      setInfo(`Copied "${name}" to clipboard`);
      navigator.clipboard.writeText(name);
    },
    [setInfo]
  );

  const handleContextMenu = React.useCallback(
    (e, node) => {
      e.preventDefault();
      e.stopPropagation();

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        node: node,
      });
    },
    []
  );

  const handleRename = React.useCallback(node => {
    const itemType = namedChildren[node.name]?.type || node.type || 'Item';
    setRenameDialog({
      currentName: node.name,
      itemType: itemType,
    });
  }, [namedChildren]);

  const handleDelete = React.useCallback(node => {
    const itemType = namedChildren[node.name]?.type || node.type || 'Item';
    setDeleteDialog({
      itemName: node.name,
      itemType: itemType,
    });
  }, [namedChildren]);

  const confirmRename = React.useCallback(
    async newName => {
      if (renameDialog && newName !== renameDialog.currentName) {
        renameNamedChild(renameDialog.currentName, newName);
        setInfo(`Renamed "${renameDialog.currentName}" to "${newName}"`);

        // Auto-save changes
        try {
          await writeModifiedFiles();
        } catch (error) {
          console.error('Failed to save rename:', error);
        }
      }
      setRenameDialog(null);
    },
    [renameDialog, renameNamedChild, setInfo, writeModifiedFiles]
  );

  const confirmDelete = React.useCallback(async () => {
    if (deleteDialog) {
      deleteNamedChild(deleteDialog.itemName);
      setInfo(`Deleted "${deleteDialog.itemName}"`);

      // Auto-save changes
      try {
        await writeModifiedFiles();
      } catch (error) {
        console.error('Failed to save deletion:', error);
      }
    }
  }, [deleteDialog, deleteNamedChild, setInfo, writeModifiedFiles]);

  const renderTreeItem = React.useCallback(
    node => {
      if (!node || !node.id || !node.name) return null;

      return (
        <div
          key={node.id}
          className="mb-2 mr-1 ml-1"
          onContextMenu={e => handleContextMenu(e, node)}
        >
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
    [handleCopyName, handleContextMenu, onItemClick]
  );

  const validData = React.useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(item => item && typeof item === 'object' && item.name);
  }, [data]);

  if (validData.length === 0) {
    return <EmptyMessage>No items to display</EmptyMessage>;
  }

  return (
    <>
      {validData.map(item => renderTreeItem(item))}

      {/* Context Menu */}
      {contextMenu && (
        <ExplorerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          itemName={contextMenu.node.name}
          onRename={() => handleRename(contextMenu.node)}
          onDelete={() => handleDelete(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <RenameDialog
          isOpen={true}
          onClose={() => setRenameDialog(null)}
          onConfirm={confirmRename}
          currentName={renameDialog.currentName}
          itemType={renameDialog.itemType}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialog && (
        <ConfirmDeleteDialog
          isOpen={true}
          onClose={() => setDeleteDialog(null)}
          onConfirm={confirmDelete}
          itemName={deleteDialog.itemName}
          itemType={deleteDialog.itemType}
        />
      )}
    </>
  );
};

export default ModelsTracesList;
