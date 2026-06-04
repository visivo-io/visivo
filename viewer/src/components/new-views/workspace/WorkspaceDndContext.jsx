import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import useStore from '../../../stores/store';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';
import LibraryDragPreview from './library/LibraryDragPreview';
import { groupDashboardsByLevel } from '../project/editor/useProjectEditorData';
import { emitWorkspaceEvent } from './telemetry';
import sanitizeDashboardConfig from './sanitizeDashboardConfig';
import {
  reorderItemsInRow,
  reorderTopLevelRows,
  insertItemAtTarget,
  buildLibraryItem,
} from '../project/canvas/canvasReorder';

/**
 * WorkspaceDndContext — VIS-802 / Track G G-1.
 *
 * The SINGLE shared dnd-kit `<DndContext>` for the whole Workspace shell.
 *
 * ### Why one context (the nesting decision)
 *
 * Track M's `<ProjectEditor>` (M-1, VIS-805) originally mounted its OWN
 * `<DndContext>` to host the drag-between-levels gesture. dnd-kit contexts do
 * NOT compose — a `useDroppable`/`useDraggable` only ever talks to its nearest
 * provider, so a Library row dragged out of the LEFT rail could never reach a
 * RefDropZone living in the RIGHT rail if each surface owned its own context.
 *
 * G-1 therefore **subsumes** ProjectEditor's context: there is exactly one
 * `<DndContext>` at the shell, and its `onDragEnd` is a router that dispatches
 * on the drag payload:
 *
 *   - `active.data.current.type === 'dashboard'`  → a ProjectEditor tile drag.
 *     Reassign the dashboard's level (the M-1 behaviour, now routed here).
 *   - `active.data.current.source === 'library'`  → a Library row drag.
 *     If it lands on a `kind: 'ref-slot'` droppable whose `allowedTypes`
 *     include the dragged type, write the ref via the zone's `onChange`;
 *     a type-mismatch is rejected (no write).
 *
 * `<ProjectEditor>` no longer mounts a context — it reads the live drag via
 * `useWorkspaceDrag()` (this module's context) for its dimming / overlay.
 *
 * The shared `<DragOverlay>` renders the right preview for whichever drag is
 * in flight (Library pill vs. dashboard tile).
 */

const WorkspaceDragContext = createContext(null);

/** Read the live shell-level drag state ({ kind, name, level } | null). */
export const useWorkspaceDrag = () => useContext(WorkspaceDragContext);

// Exposes the shell's `commitCanvasConfig` (sanitize → optimistic → save) to
// non-DnD canvas affordances — the "+ Add Row" template menu + empty-canvas CTA
// (VIS-794 / D-7, D-8) — so they reuse the SAME persistence path the DnD router
// uses, rather than re-implementing the save flow.
const WorkspaceCommitContext = createContext(null);

/** Read the shell's `commitCanvasConfig(dashboardName, nextConfig)` committer. */
export const useWorkspaceCommit = () => useContext(WorkspaceCommitContext);

/**
 * Pure router for the shared `onDragEnd`. Decides what a finished drag means
 * from its `active`/`over` payloads and invokes the right side effect. Exported
 * so the routing decision is unit-testable without simulating a real dnd-kit
 * pointer drag (which jsdom cannot do).
 *
 * @param {object} event              dnd-kit drag-end event `{ active, over }`.
 * @param {object} deps
 * @param {Array}  deps.dashboards    current dashboards list (for level groups).
 * @param {object} deps.projectDefaults defaults used to resolve level groups.
 * @param {Function} deps.reassignDashboardLevel store action.
 * @param {Function} deps.commitCanvasConfig  applies a next dashboard config
 *                   (sanitize → optimistic → save) for canvas D-3 mutations:
 *                   `(dashboardName, nextConfig, meta) => void`.
 * @param {Function} deps.emit        telemetry emitter.
 * @returns {string} a short tag describing the routed action (for tests):
 *          'reassign_level' | 'ref_accepted' | 'ref_rejected' |
 *          'canvas_reorder_items' | 'canvas_reorder_rows' |
 *          'canvas_library_insert' | 'noop'.
 */
export const routeWorkspaceDragEnd = (
  event,
  { dashboards, projectDefaults, reassignDashboardLevel, commitCanvasConfig, emit }
) => {
  const { active, over } = event || {};
  if (!over) return 'noop';
  const dragData = active?.data?.current;
  const dropData = over?.data?.current;
  if (!dragData || !dropData) return 'noop';

  // ── Branch 1: ProjectEditor tile → level reassignment (M-1) ─────────────
  if (dragData.type === 'dashboard' && dropData.levelKey !== undefined) {
    const groups = groupDashboardsByLevel(dashboards || [], projectDefaults);
    const target = groups.find(g => g.levelKey === dropData.levelKey);
    if (!target) return 'noop';
    if (reassignDashboardLevel) reassignDashboardLevel(dragData.name, target.levelValue);
    emit &&
      emit('project_editor_action', {
        kind: 'reassign_level',
        name: dragData.name,
        level: target.levelValue,
      });
    return 'reassign_level';
  }

  // ── Branch 2: Library row → RefDropZone (G-1) ────────────────────────────
  if (dragData.source === 'library' && dropData.kind === 'ref-slot') {
    const allowed = dropData.allowedTypes || [];
    const isValid = allowed.includes(dragData.type);
    emit &&
      emit('ref_dropzone_drop', {
        refId: dropData.refId,
        type: dragData.type,
        name: dragData.name,
        accepted: isValid,
      });
    // Type-mismatch rejects: no write (the zone's red flash communicated it).
    if (!isValid) return 'ref_rejected';
    if (typeof dropData.onChange === 'function') {
      dropData.onChange({ type: dragData.type, name: dragData.name });
    }
    return 'ref_accepted';
  }

  // ── Branch 3: Canvas drop zones (VIS-771 / D-3) ──────────────────────────
  // Canvas droppables carry `{ kind: 'canvas-drop', target, dashboardName,
  // config }`. `target` is the normalised insertion / reorder descriptor (see
  // canvasReorder.insertItemAtTarget). The live dashboard config is snapshotted
  // onto the droppable's `data` so the router transforms the same object the
  // canvas rendered, then commits it through the shared save path.
  if (dropData.kind === 'canvas-drop') {
    const { target, dashboardName, config } = dropData;
    if (!target || !dashboardName || !config) return 'noop';
    if (typeof commitCanvasConfig !== 'function') return 'noop';

    // 3a. Canvas → canvas reorder (item within a row, or top-level rows).
    if (dragData.source === 'canvas') {
      // Item reorder: drag item path + drop a `between-items`/`end-of-row`
      // target on the SAME row → move the item inside that row.
      if (
        dragData.kind === 'item' &&
        (target.kind === 'between-items' || target.kind === 'end-of-row') &&
        target.rowPath === dragData.rowPath
      ) {
        const fromIndex = dragData.itemIndex;
        let toIndex =
          target.kind === 'end-of-row'
            ? Number.MAX_SAFE_INTEGER
            : target.index;
        // Dropping just after the source slot is a no-op; normalise so a 1-step
        // right move lands correctly (splice removes the source first).
        if (target.kind === 'between-items' && toIndex > fromIndex) toIndex -= 1;
        const next = reorderItemsInRow(config, dragData.rowPath, fromIndex, toIndex);
        if (next === config) return 'noop';
        commitCanvasConfig(dashboardName, next, { kind: 'reorder_items' });
        emit &&
          emit('canvas_dnd', {
            kind: 'reorder_items',
            rowPath: dragData.rowPath,
            from: fromIndex,
          });
        return 'canvas_reorder_items';
      }

      // Row reorder: drag a top-level row + drop a `between-rows` target.
      if (dragData.kind === 'row' && target.kind === 'between-rows') {
        const fromIndex = dragData.rowIndex;
        let toIndex = target.index;
        if (toIndex > fromIndex) toIndex -= 1;
        const next = reorderTopLevelRows(config, fromIndex, toIndex);
        if (next === config) return 'noop';
        commitCanvasConfig(dashboardName, next, { kind: 'reorder_rows' });
        emit && emit('canvas_dnd', { kind: 'reorder_rows', from: fromIndex, to: toIndex });
        return 'canvas_reorder_rows';
      }

      return 'noop';
    }

    // 3b. Library → canvas insert (creates a new item referencing the object).
    if (dragData.source === 'library') {
      const newItem = buildLibraryItem(dragData.type, dragData.name);
      const next = insertItemAtTarget(config, target, newItem);
      if (next === config) return 'noop';
      commitCanvasConfig(dashboardName, next, { kind: 'library_insert' });
      emit &&
        emit('canvas_dnd', {
          kind: 'library_insert',
          type: dragData.type,
          name: dragData.name,
          target: target.kind,
        });
      return 'canvas_library_insert';
    }
  }

  return 'noop';
};

const DashboardIcon = getTypeIcon('dashboard');
const DASH_COLORS = getTypeColors('dashboard');

const DashboardTilePreview = ({ name }) => (
  <div className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-[13px] font-semibold text-gray-900 shadow-lg ring-2 ring-primary">
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded ${DASH_COLORS.bg} ${DASH_COLORS.text}`}
    >
      <DashboardIcon style={{ fontSize: 12 }} />
    </span>
    {name}
  </div>
);

const WorkspaceDndContext = ({ children }) => {
  const dashboards = useStore(s => s.dashboards);
  const defaults = useStore(s => s.defaults);
  const project = useStore(s => s.project);
  const reassignDashboardLevel = useStore(s => s.reassignDashboardLevel);
  const saveDashboard = useStore(s => s.saveDashboard);
  const updateDashboardConfigOptimistic = useStore(s => s.updateDashboardConfigOptimistic);

  // `activeDrag` mirrors the dnd-kit `active` payload in a shape both overlays
  // and consumers (ProjectEditor) can read: `{ kind, name, level, type }`.
  const [activeDrag, setActiveDrag] = useState(null);

  // Commit a canvas-driven config mutation (D-3): sanitize so the payload is
  // always backend-valid (GAP-3 — see sanitizeDashboardConfig), optimistically
  // swap the store config so the canvas + Outline reflect it immediately, then
  // persist through the shared dashboard save path (the SAME path the right-rail
  // forms use via RightRailEditPanel.persistConfig).
  const commitCanvasConfig = useCallback(
    (dashboardName, nextConfig) => {
      if (!dashboardName) return;
      const clean = sanitizeDashboardConfig(nextConfig);
      if (updateDashboardConfigOptimistic) {
        updateDashboardConfigOptimistic(dashboardName, clean);
      }
      if (typeof saveDashboard === 'function') {
        saveDashboard(dashboardName, clean);
      }
    },
    [updateDashboardConfigOptimistic, saveDashboard]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const projectDefaults = useMemo(
    () => defaults || project?.config?.defaults || project?.project_json?.defaults || null,
    [defaults, project]
  );

  const handleDragStart = useCallback(event => {
    const data = event.active?.data?.current;
    if (!data) return;
    if (data.type === 'dashboard') {
      setActiveDrag({ kind: 'dashboard', name: data.name, level: data.level, type: 'dashboard' });
      return;
    }
    if (data.source === 'library') {
      setActiveDrag({ kind: 'library', name: data.name, type: data.type, data });
      return;
    }
    // Canvas item/row drag (VIS-771 / D-3). The drag preview IS the source pill
    // (no thumbnail, per architecture §2.6) — for an item we render the same
    // Library-style pill keyed on the referenced object's type + name.
    if (data.source === 'canvas') {
      setActiveDrag({
        kind: 'canvas',
        canvasKind: data.kind,
        name: data.label || data.name,
        type: data.refType || 'chart',
        data: { source: 'library', type: data.refType || 'chart', name: data.label || data.name },
      });
    }
  }, []);

  const handleDragCancel = useCallback(() => setActiveDrag(null), []);

  const handleDragEnd = useCallback(
    event => {
      setActiveDrag(null);
      routeWorkspaceDragEnd(event, {
        dashboards,
        projectDefaults,
        reassignDashboardLevel,
        commitCanvasConfig,
        emit: emitWorkspaceEvent,
      });
    },
    [dashboards, projectDefaults, reassignDashboardLevel, commitCanvasConfig]
  );

  return (
    <WorkspaceDragContext.Provider value={activeDrag}>
      <WorkspaceCommitContext.Provider value={commitCanvasConfig}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeDrag?.kind === 'dashboard' ? (
            <DashboardTilePreview name={activeDrag.name} />
          ) : activeDrag?.kind === 'library' || activeDrag?.kind === 'canvas' ? (
            // Canvas item/row drags reuse the SAME pill shape as a Library drag
            // (architecture §2.6: "the drag preview IS the source pill").
            <LibraryDragPreview data={activeDrag.data} />
          ) : null}
        </DragOverlay>
      </DndContext>
      </WorkspaceCommitContext.Provider>
    </WorkspaceDragContext.Provider>
  );
};

export default WorkspaceDndContext;
