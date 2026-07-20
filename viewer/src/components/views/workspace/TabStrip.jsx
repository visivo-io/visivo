import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
} from '@dnd-kit/core';
import { PiX, PiPlus, PiWarningCircle, PiCaretLeft, PiCaretRight } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeIcon } from '../common/objectTypeConfigs';
import TabCloseConfirmDialog from './TabCloseConfirmDialog';

// Tab icons resolve entirely through `objectTypeConfigs.js` — the TabStrip
// only ever hosts DOCUMENT tabs (Explore 2.0 Phase 0 retired the `project`
// special case: project/semantic-layer/explorer left the tab model
// altogether, so there's no chrome type left here to special-case; every
// remaining tab type has a real `objectTypeConfigs` entry).
const getTabIcon = type => getTypeIcon(type);

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
  // Explorations are the one document type whose STABLE identity (`tab.name`
  // = the backend id, so URLs/lookups survive a rename) differs from its
  // DISPLAYED name (the renamable `record.name` — 01-ux-spec.md §4's inline
  // rename). Every other type's `tab.name` already IS its display name, so
  // this lookup only ever engages for `exploration` tabs.
  const explorationDisplayName = useStore(s =>
    tab.type === 'exploration' ? s.workspaceExplorations.byId[tab.name]?.name : null
  );
  const displayName = explorationDisplayName || tab.name;
  // VIS-1083: a 404'd sync means the backend record for this exploration tab
  // is gone (another session's delete, or an out-of-band removal) — the
  // pane's own banner (`ExplorationDeletedRemotelyBanner`) carries the real
  // recovery options, but a PARKED tab never shows the pane, so this is the
  // only surface that can flag it before the user even switches to it.
  const explorationDeletedRemotely = useStore(
    s => tab.type === 'exploration' && s.workspaceExplorations.byId[tab.name]?.syncStatus === 'deleted-remotely'
  );
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
        title={displayName}
        data-testid={`workspace-tab-select-${tab.id}`}
      >
        <TypeIcon aria-hidden="true" style={{ fontSize: 14 }} className="shrink-0 text-gray-500" />
        <span className="truncate">{displayName}</span>
        {explorationDeletedRemotely ? (
          <PiWarningCircle
            title="This exploration was deleted — open it to recover"
            data-testid={`workspace-tab-deleted-remotely-${tab.id}`}
            aria-hidden="true"
            className="h-3 w-3 shrink-0 text-highlight-600"
          />
        ) : (
          tab.dirty && (
            <span
              title="Unsaved changes"
              data-testid={`workspace-tab-dirty-${tab.id}`}
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            />
          )
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
        aria-label={`Close ${displayName}`}
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
 * prop-drilling from the route container. Documents only — the three
 * destinations (Project/Semantic Layer/Explorer) live in the LeftRail's
 * `<ViewSwitcher>`, not here (Explore 2.0 Phase 0). Supports: click-to-switch,
 * close-through-the-dirty-guard (VIS-812 — the ×
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

  // Overflow affordance (shell-ia #6 — "tabs clip off the left edge, + button
  // disappears, no scroll affordance"): the scrollable tab track lives in its
  // OWN container (not the same one the `+` button sits in — that button is
  // persistent chrome per the docstring below and must never scroll away),
  // and click-to-scroll chevrons appear at either edge exactly when there's
  // more to see in that direction — the visible signal a scrollbar-less
  // overflow region otherwise gives no hint of.
  const scrollTrackRef = useRef(null);
  const [scrollAffordance, setScrollAffordance] = useState({ left: false, right: false });
  const updateScrollAffordance = useCallback(() => {
    const el = scrollTrackRef.current;
    if (!el) return;
    setScrollAffordance({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);
  useEffect(() => {
    updateScrollAffordance();
  }, [tabs?.length, updateScrollAffordance]);
  useEffect(() => {
    const el = scrollTrackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateScrollAffordance);
    observer.observe(el);
    el.addEventListener('scroll', updateScrollAffordance, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', updateScrollAffordance);
    };
  }, [updateScrollAffordance]);
  const scrollTrackBy = useCallback(amount => {
    scrollTrackRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  }, []);

  // The strip is persistent chrome (01-ux-spec.md §1's `[+]` control lives here
  // regardless of the open-tab count) — it no longer disappears when the tab
  // list is empty. Before Phase 0 the project tab was ALWAYS hydrated, so an
  // empty strip could never actually happen; now that project left the tab
  // model, `/workspace` with no document open is the default state, and this
  // early return would otherwise hide the `+` affordance on every fresh visit.
  const safeTabs = tabs || [];

  const projectName = project?.project_json?.name || project?.name || 'project';

  // The + affordance (and Cmd/Ctrl+T) opens the Workspace's "empty tab" — the
  // Project destination's Home. `openWorkspaceTab` routes a `project`-typed
  // payload to `openWorkspaceView` (views left the tab model, Phase 0), so
  // repeated presses just re-activate the same Home rather than opening
  // anything new.
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
      <div className="relative flex min-w-0 flex-1 items-stretch">
        {scrollAffordance.left && (
          <button
            type="button"
            onClick={() => scrollTrackBy(-160)}
            title="Scroll tabs left"
            aria-label="Scroll tabs left"
            data-testid="workspace-tab-scroll-left"
            className="absolute inset-y-0 left-0 z-10 flex w-6 items-center justify-center bg-gradient-to-r from-gray-50 via-gray-50/90 to-transparent text-gray-500 hover:text-gray-900"
          >
            <PiCaretLeft className="h-3 w-3" />
          </button>
        )}
        <div
          ref={scrollTrackRef}
          className="flex flex-1 items-stretch overflow-x-auto overflow-y-hidden scroll-smooth"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {safeTabs.map(tab => (
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
        </div>
        {scrollAffordance.right && (
          <button
            type="button"
            onClick={() => scrollTrackBy(160)}
            title="Scroll tabs right"
            aria-label="Scroll tabs right"
            data-testid="workspace-tab-scroll-right"
            className="absolute inset-y-0 right-0 z-10 flex w-6 items-center justify-center bg-gradient-to-l from-gray-50 via-gray-50/90 to-transparent text-gray-500 hover:text-gray-900"
          >
            <PiCaretRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {/* Persistent chrome (01-ux-spec.md §1's `[+]` control) — lives OUTSIDE
          the scrollable tab track so it can never scroll out of view (the
          shell-ia #6 regression: it used to share the scroll container with
          the tabs and would clip away with them). */}
      <button
        type="button"
        onClick={handleNewTab}
        title="New tab"
        aria-label="New tab"
        data-testid="workspace-tab-new"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center border-l border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <PiPlus className="h-3.5 w-3.5" />
      </button>
      <TabCloseConfirmDialog />
    </div>
  );
};

export default TabStrip;
