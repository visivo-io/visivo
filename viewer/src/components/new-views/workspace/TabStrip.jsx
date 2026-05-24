import React, { useState } from 'react';
import { PiX, PiPlus, PiCube } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeIcon } from '../common/objectTypeConfigs';

// Tab icons come from the canonical `objectTypeConfigs.js` for the 13 data-
// object types. `project` is workspace-chrome — not a data object — so it
// keeps its Phosphor glyph here as a one-line special case.
const PROJECT_TAB_ICON = PiCube;
const getTabIcon = type => (type === 'project' ? PROJECT_TAB_ICON : getTypeIcon(type));

/**
 * WorkspaceTab — a single tab in the strip (presentational).
 *
 * Per the delivered B-1 design:
 *   - type icon + name + dirty dot + close (×).
 *   - Active tab: white background, dark text, mulberry bottom underline.
 *   - Inactive tab: gray track, lighter text; hover lifts to white.
 *   - Dragging tab: opacity-60 ghost in place.
 *   - Close button: always visible when active or dirty; fades in on hover otherwise.
 */
const WorkspaceTab = ({ tab, active, onSelect, onClose, isDragging }) => {
  const TypeIcon = getTabIcon(tab.type);
  return (
    <div
      role="tab"
      aria-selected={active}
      data-testid={`workspace-tab-${tab.id}`}
      data-active={active ? 'true' : 'false'}
      data-dragging={isDragging ? 'true' : 'false'}
      className={[
        'group/tab relative flex h-9 min-w-0 max-w-[220px] shrink-0 items-center gap-1.5 border-r border-gray-200 px-3 text-[12.5px] transition-colors',
        active
          ? 'bg-white text-gray-900 font-medium'
          : 'bg-gray-50 text-gray-600 hover:bg-white/70 hover:text-gray-900',
        isDragging ? 'opacity-60 ring-1 ring-inset ring-primary' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect && onSelect(tab.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={tab.name}
        data-testid={`workspace-tab-select-${tab.id}`}
      >
        <TypeIcon aria-hidden="true" style={{ fontSize: 14 }} className="shrink-0 text-gray-500" />
        <span className="truncate">{tab.name}</span>
        {tab.dirty && (
          <span
            title="Unsaved changes"
            data-testid={`workspace-tab-dirty-${tab.id}`}
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          />
        )}
      </button>
      <button
        type="button"
        draggable={false}
        onClick={e => {
          e.stopPropagation();
          onClose && onClose(tab.id);
        }}
        title="Close tab"
        aria-label={`Close ${tab.name}`}
        data-testid={`workspace-tab-close-${tab.id}`}
        className={[
          'ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-gray-400 transition-opacity',
          active || tab.dirty
            ? 'opacity-100 hover:bg-gray-200 hover:text-gray-900'
            : 'opacity-0 group-hover/tab:opacity-100 hover:bg-gray-200 hover:text-gray-900',
        ].join(' ')}
      >
        <PiX className="h-3 w-3" />
      </button>
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary"
        />
      )}
    </div>
  );
};

/**
 * TabStrip — h-9 white bar between the top bar and the middle/right area.
 *
 * Sits OVER the middle + right rail only — the left rail anchors full-height.
 * This visually signals that tabs scope the active-object area (middle +
 * right rail), not the project-wide Library.
 *
 * Reads tabs + active id + actions directly from the workspace store — no
 * prop-drilling from the route container. Phase 0 supports: open project
 * tab on mount, click-to-switch, close, AND drag-to-reorder (native HTML5
 * drag, no extra dep — dispatches `reorderWorkspaceTabs` on drop). Per the
 * B-1 design, the dragged tab gets the ghost styling and the drop target
 * gets a 2-px mulberry slot indicator on its left edge.
 */
const TabStrip = () => {
  const tabs = useStore(s => s.workspaceTabs);
  const activeId = useStore(s => s.workspaceActiveTabId);
  const switchWorkspaceTab = useStore(s => s.switchWorkspaceTab);
  const closeWorkspaceTab = useStore(s => s.closeWorkspaceTab);
  const reorderWorkspaceTabs = useStore(s => s.reorderWorkspaceTabs);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const project = useStore(s => s.project);

  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  if (!tabs || tabs.length === 0) return null;

  const projectName = project?.project_json?.name || project?.name || 'project';

  // Defer real "open in new tab" semantics to VIS-O2; the + button is a
  // visual affordance for now. Focus the project tab as a sane default.
  const handleNewTab = () =>
    openWorkspaceTab({
      id: `project:${projectName}`,
      type: 'project',
      name: projectName,
    });

  const handleDragStart = (e, tab) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.id);
    setDraggedId(tab.id);
  };
  const handleDragOver = (e, tab) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tab.id !== draggedId && dragOverId !== tab.id) {
      setDragOverId(tab.id);
    }
  };
  const handleDrop = (e, tab) => {
    e.preventDefault();
    const sourceId =
      (e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData('text/plain')) ||
      draggedId;
    if (sourceId && sourceId !== tab.id) {
      reorderWorkspaceTabs(sourceId, tab.id);
    }
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div
      data-testid="workspace-tab-strip"
      role="tablist"
      aria-label="Workspace tabs"
      className="relative flex h-9 shrink-0 items-stretch border-b border-gray-200 bg-gray-50"
    >
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.map(tab => {
          const isDragging = tab.id === draggedId;
          const isDropTarget = tab.id === dragOverId && dragOverId !== draggedId;
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={e => handleDragStart(e, tab)}
              onDragOver={e => handleDragOver(e, tab)}
              onDrop={e => handleDrop(e, tab)}
              onDragEnd={handleDragEnd}
              data-testid={`workspace-tab-wrapper-${tab.id}`}
              className="relative"
            >
              {isDropTarget && (
                <span
                  aria-hidden="true"
                  data-testid={`workspace-tab-drop-slot-${tab.id}`}
                  className="pointer-events-none absolute inset-y-1 left-0 z-10 w-0.5 rounded-full bg-primary"
                />
              )}
              <WorkspaceTab
                tab={tab}
                active={tab.id === activeId}
                onSelect={switchWorkspaceTab}
                onClose={closeWorkspaceTab}
                isDragging={isDragging}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={handleNewTab}
          title="New tab"
          aria-label="New tab"
          data-testid="workspace-tab-new"
          className="ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <PiPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default TabStrip;
