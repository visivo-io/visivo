import React, { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
} from '@dnd-kit/core';
import { PiX, PiPlus, PiCube } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeIcon } from '../common/objectTypeConfigs';
import TabCloseConfirmDialog from './TabCloseConfirmDialog';

// Tab icons come from the canonical `objectTypeConfigs.js` for the 13 data-
// object types. `project` is workspace-chrome — not a data object — so it
// keeps its Phosphor glyph here as a one-line special case.
const PROJECT_TAB_ICON = PiCube;
const getTabIcon = type => (type === 'project' ? PROJECT_TAB_ICON : getTypeIcon(type));

/**
 * Resolve a dnd-kit drag-end event to a `[activeId, overId]` reorder pair,
 * or null when the drop shouldn't reorder (no target / dropped on itself).
 * Exported for unit tests — the gesture itself is covered by the Playwright
 * story (workspace-tabs-shortcuts.spec.mjs).
 */
export const tabDragEndToReorder = event => {
  const activeId = event?.active?.id;
  const overId = event?.over?.id;
  if (!activeId || !overId || activeId === overId) return null;
  return [activeId, overId];
};

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
 * DraggableTab — wraps a WorkspaceTab as BOTH a dnd-kit drag source and a
 * drop target keyed on the tab id (VIS-812 / O-3). The PointerSensor's
 * distance constraint keeps plain clicks flowing to the select/close
 * buttons; only an actual horizontal pull starts the reorder. The dragged
 * tab ghosts in place; the hovered target paints the 2-px mulberry slot
 * indicator on its left edge (per the B-1 design).
 */
const DraggableTab = ({ tab, active, onSelect, onClose, isDragging, isDropTarget, scrollRef }) => {
  const drag = useDraggable({ id: tab.id });
  const drop = useDroppable({ id: tab.id });
  const setRefs = el => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
    if (scrollRef) scrollRef(el);
  };
  return (
    <div
      ref={setRefs}
      {...drag.listeners}
      {...drag.attributes}
      data-testid={`workspace-tab-wrapper-${tab.id}`}
      className="relative"
      style={{ touchAction: 'none' }}
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
        active={active}
        onSelect={onSelect}
        onClose={onClose}
        isDragging={isDragging}
      />
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
 * prop-drilling from the route container. Supports: open project tab on
 * mount, click-to-switch, close-through-the-dirty-guard (VIS-812 — the ×
 * routes through `requestCloseWorkspaceTab`, so dirty tabs raise the
 * confirmation dialog), drag-to-reorder via a strip-local dnd-kit context
 * (pointer-driven, so it's exercisable with a real cursor), and horizontal
 * overflow scrolling with the active tab kept in view.
 */
const TabStrip = () => {
  const tabs = useStore(s => s.workspaceTabs);
  const activeId = useStore(s => s.workspaceActiveTabId);
  const switchWorkspaceTab = useStore(s => s.switchWorkspaceTab);
  const requestCloseWorkspaceTab = useStore(s => s.requestCloseWorkspaceTab);
  const reorderWorkspaceTabs = useStore(s => s.reorderWorkspaceTabs);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const project = useStore(s => s.project);

  // Live drag state for the ghost + slot-indicator styling.
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Distance constraint: a plain click never starts a drag, so the tab's
  // select/close buttons keep working without stopPropagation gymnastics.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Keep the active tab visible when the strip overflows (>8 tabs scroll).
  const tabElsRef = useRef(new Map());
  useEffect(() => {
    const el = tabElsRef.current.get(activeId);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [activeId]);

  if (!tabs || tabs.length === 0) return null;

  const projectName = project?.project_json?.name || project?.name || 'project';

  // The + affordance (and Cmd/Ctrl+T) opens the Workspace's "empty tab" —
  // the unscoped project tab. The project is a first-class single-instance
  // tab per the delivered B-1 design, so repeated presses focus it.
  const handleNewTab = () =>
    openWorkspaceTab({
      id: `project:${projectName}`,
      type: 'project',
      name: projectName,
    });

  const handleDragStart = event => {
    setDraggedId(event.active?.id || null);
  };
  const handleDragOver = event => {
    const overId = event.over?.id || null;
    setDragOverId(overId === event.active?.id ? null : overId);
  };
  const handleDragEnd = event => {
    const pair = tabDragEndToReorder(event);
    if (pair) reorderWorkspaceTabs(pair[0], pair[1]);
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragCancel = () => {
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
      <div className="flex flex-1 items-stretch overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {tabs.map(tab => (
            <DraggableTab
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              onSelect={switchWorkspaceTab}
              onClose={requestCloseWorkspaceTab}
              isDragging={tab.id === draggedId}
              isDropTarget={tab.id === dragOverId && dragOverId !== draggedId}
              scrollRef={el => {
                if (el) tabElsRef.current.set(tab.id, el);
                else tabElsRef.current.delete(tab.id);
              }}
            />
          ))}
        </DndContext>
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
      <TabCloseConfirmDialog />
    </div>
  );
};

export default TabStrip;
