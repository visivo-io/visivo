import React, { useState } from 'react';
import { PiPlus, PiX } from 'react-icons/pi';
import useStore from '../../stores/store';

const ExplorationTabBar = () => {
  const explorations = useStore(s => s.explorerExplorations);
  const activeId = useStore(s => s.explorerActiveExplorationId);
  const switchExploration = useStore(s => s.switchExploration);
  const createNewExploration = useStore(s => s.createNewExploration);
  const closeExploration = useStore(s => s.closeExploration);
  const renameExploration = useStore(s => s.renameExploration);

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  if (explorations.length < 2) {
    return null;
  }

  const handleDoubleClick = exploration => {
    setEditingId(exploration.id);
    setEditingName(exploration.name);
  };

  const handleRenameCommit = async () => {
    if (editingId && editingName.trim()) {
      await renameExploration(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleClose = async (e, explorationId) => {
    e.stopPropagation();
    await closeExploration(explorationId);
  };

  return (
    <div
      className="flex items-center border-b border-secondary-200 bg-white flex-shrink-0"
      data-testid="exploration-tab-bar"
    >
      {explorations.map(exploration => {
        const isActive = exploration.id === activeId;
        const isEditing = editingId === exploration.id;

        return (
          <div
            key={exploration.id}
            className={`flex items-center gap-1 px-3 py-2 text-xs cursor-pointer transition-colors border-b-2 group ${
              isActive
                ? 'border-primary text-primary bg-primary-50'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50'
            }`}
            onClick={() => switchExploration(exploration.id)}
            onDoubleClick={() => handleDoubleClick(exploration)}
            data-testid={`exploration-tab-${exploration.id}`}
          >
            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onBlur={handleRenameCommit}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameCommit();
                  if (e.key === 'Escape') {
                    setEditingId(null);
                    setEditingName('');
                  }
                }}
                className="w-24 px-1 py-0.5 text-xs border border-primary-300 rounded focus:outline-none"
                autoFocus
                onClick={e => e.stopPropagation()}
                data-testid="exploration-rename-input"
              />
            ) : (
              <span className="truncate max-w-[120px]">{exploration.name}</span>
            )}

            {exploration.isDirty && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-secondary-400"
                title="Unsaved changes"
                data-testid={`dirty-indicator-${exploration.id}`}
              />
            )}

            {explorations.length > 1 && (
              <button
                type="button"
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary-200 transition-all"
                onClick={e => handleClose(e, exploration.id)}
                title="Close tab"
                data-testid={`close-tab-${exploration.id}`}
              >
                <PiX size={12} />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="flex items-center gap-1 px-2 py-2 text-xs text-secondary-400 hover:text-secondary-600 hover:bg-secondary-50 transition-colors"
        onClick={() => createNewExploration()}
        title="New exploration"
        data-testid="new-exploration-btn"
      >
        <PiPlus size={14} />
      </button>
    </div>
  );
};

export default ExplorationTabBar;
