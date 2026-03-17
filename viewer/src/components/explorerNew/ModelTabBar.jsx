import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { PiPlus, PiX } from 'react-icons/pi';
import useStore from '../../stores/store';

/**
 * Determine which model names are referenced by insights currently on the chart.
 * Scans insight props and interactions for ref(modelName) patterns.
 */
const getReferencedModelNames = (chartInsightNames, insightStates) => {
  const referenced = new Set();
  const refPattern = /ref\(([^)]+)\)/g;

  for (const insightName of chartInsightNames) {
    const insight = insightStates[insightName];
    if (!insight) continue;

    // Scan props values
    for (const value of Object.values(insight.props || {})) {
      if (typeof value === 'string') {
        let match;
        while ((match = refPattern.exec(value)) !== null) {
          referenced.add(match[1]);
        }
        refPattern.lastIndex = 0;
      }
    }

    // Scan interaction values
    for (const interaction of insight.interactions || []) {
      if (typeof interaction.value === 'string') {
        let match;
        while ((match = refPattern.exec(interaction.value)) !== null) {
          referenced.add(match[1]);
        }
        refPattern.lastIndex = 0;
      }
    }
  }

  return referenced;
};

const ModelTabBar = () => {
  const tabs = useStore((s) => s.explorerModelTabs);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const modelStates = useStore((s) => s.explorerModelStates);
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const insightStates = useStore((s) => s.explorerInsightStates);
  const switchModelTab = useStore((s) => s.switchModelTab);
  const createModelTab = useStore((s) => s.createModelTab);
  const closeModelTab = useStore((s) => s.closeModelTab);
  const renameModelTab = useStore((s) => s.renameModelTab);

  const [renamingTab, setRenamingTab] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef(null);

  const referencedModels = useMemo(
    () => getReferencedModelNames(chartInsightNames, insightStates),
    [chartInsightNames, insightStates]
  );

  useEffect(() => {
    if (renamingTab && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTab]);

  const handleDoubleClick = useCallback(
    (tabName) => {
      if (tabName !== activeModelName) return;
      const modelState = modelStates[tabName];
      if (!modelState || !modelState.isNew) return;
      setRenamingTab(tabName);
      setRenameValue(tabName);
    },
    [activeModelName, modelStates]
  );

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renamingTab && !tabs.includes(trimmed)) {
      renameModelTab(renamingTab, trimmed);
    }
    setRenamingTab(null);
    setRenameValue('');
  }, [renameValue, renamingTab, tabs, renameModelTab]);

  const cancelRename = useCallback(() => {
    setRenamingTab(null);
    setRenameValue('');
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename]
  );

  if (tabs.length === 0) {
    return (
      <div
        className="flex items-center px-3 py-1.5 bg-secondary-50 border-b border-secondary-200"
        data-testid="model-tab-bar"
      >
        <span className="text-xs text-secondary-400" data-testid="no-models-message">
          No models
        </span>
        <button
          type="button"
          onClick={() => createModelTab()}
          className="ml-2 p-0.5 text-secondary-400 hover:text-secondary-600 transition-colors"
          title="Add model"
          data-testid="add-model-tab"
        >
          <PiPlus size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 bg-secondary-50 border-b border-secondary-200 overflow-x-auto flex-shrink-0"
      data-testid="model-tab-bar"
    >
      {tabs.map((tabName) => {
        const isActive = tabName === activeModelName;
        const modelState = modelStates[tabName];
        const isNew = modelState?.isNew;
        const isReferenced = referencedModels.has(tabName);
        const isRenaming = renamingTab === tabName;

        const activeClasses = isActive
          ? 'bg-amber-50 border-b-2 border-amber-500'
          : 'bg-white hover:bg-secondary-50 border-b-2 border-transparent';

        const referencedClasses = isReferenced ? 'ring-1 ring-purple-400' : '';

        return (
          <div
            key={tabName}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-t-md
              border border-secondary-200 border-b-0
              text-xs font-medium cursor-pointer
              transition-colors duration-150
              ${activeClasses}
              ${referencedClasses}
            `}
            data-testid={`model-tab-${tabName}`}
            onClick={() => {
              if (!isRenaming) {
                switchModelTab(tabName);
              }
            }}
          >
            {isNew && (
              <span
                className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"
                data-testid={`status-dot-${tabName}`}
              />
            )}

            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitRename}
                className="text-xs font-medium bg-white border border-amber-300 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-amber-400 w-24"
                data-testid="rename-input"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="text-amber-800 truncate max-w-[120px]"
                data-testid={`tab-label-${tabName}`}
                onDoubleClick={() => handleDoubleClick(tabName)}
              >
                {tabName}
              </span>
            )}

            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeModelTab(tabName);
                }}
                className="p-0.5 text-secondary-400 hover:text-secondary-600 transition-colors flex-shrink-0"
                title={`Close ${tabName}`}
                data-testid={`close-tab-${tabName}`}
              >
                <PiX size={10} />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => createModelTab()}
        className="p-1 text-secondary-400 hover:text-secondary-600 transition-colors flex-shrink-0"
        title="Add model"
        data-testid="add-model-tab"
      >
        <PiPlus size={14} />
      </button>
    </div>
  );
};

export default ModelTabBar;
