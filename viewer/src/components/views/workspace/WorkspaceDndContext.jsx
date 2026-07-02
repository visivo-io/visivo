import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import useStore from '../../../stores/store';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';
import LibraryDragPreview from './library/LibraryDragPreview';
import { groupDashboardsByLevel } from '../project/editor/useProjectEditorData';
import { emitWorkspaceEvent } from './telemetry';
import { checkLeafExclusivity } from './itemMutations';
import { validateRecordConfig, validateRecordConfigSync } from './validateAgainstSchema';
import {
  reorderItemsInRow,
  moveItemBetweenRows,
  moveItemIntoSlot,
  reorderTopLevelRows,
  reorderRowsInContainer,
  parseNestedRowPath,
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

/**
 * Collision strategy for the shared context. dnd-kit's default
 * (`rectIntersection`) resolves the drop by greatest rectangle-overlap between
 * the dragged element and each droppable. On the canvas the drop zones overlap
 * (a thin between-rows band sits next to taller item/end-of-row zones), so a
 * row-handle drag aimed at a between-rows gap loses the collision to a larger
 * neighbouring zone and the row never reorders. `pointerWithin` resolves to the
 * droppable under the CURSOR, which is exactly the gap the user is pointing at;
 * we fall back to `rectIntersection` when the pointer is between zones so
 * coarser targets (Library → RefDropZone, project-editor level zones) keep
 * working. This is the dnd-kit-recommended composite for overlapping droppables.
 */
export const workspaceCollisionDetection = args => {
  const drag = args.active?.data?.current;
  let droppableContainers = args.droppableContainers;
  // For CANVAS drags the gap zones overlap (a between-rows band abuts the next
  // row's between-items zone), so restrict the candidate set by drag type:
  //   - row drag  → only between-rows zones can be the target,
  //   - item drag → everything EXCEPT between-rows zones.
  // This is what makes a row-handle drag reliably reorder rows instead of
  // resolving to a neighbouring item gap. Non-canvas drags (Library → RefDropZone,
  // project-editor level reassignment) are left unfiltered.
  if (drag?.source === 'canvas' && Array.isArray(droppableContainers)) {
    const isBetweenRows = c => c?.data?.current?.target?.kind === 'between-rows';
    if (drag.kind === 'row') {
      // Row drag → only between-rows gaps are valid. They're thin, sparse bands,
      // so use closestCenter (distance-based) rather than pointerWithin: the user
      // never has to land the pointer exactly inside the ~22px band, just nearest
      // it. This is what makes row reorder land reliably.
      //
      // VIS-903: with nested layouts there are now between-rows bands at multiple
      // depths (top-level + per-container). Scope the candidate bands to the SAME
      // sibling group as the dragged row — a nested row resolves only to its
      // container's bands, a top-level row only to the top-level bands — so a
      // distance-based pick can never land on a band in a different container
      // (which the router would no-op, making the gesture feel dead).
      const containerOf = path => {
        // `row.0.item.1.row.0` → container `row.0.item.1`; `row.0` → '' (top).
        if (typeof path !== 'string') return '';
        const lastRow = path.lastIndexOf('row.');
        return lastRow > 0 ? path.slice(0, lastRow - 1) : '';
      };
      const dragContainer = containerOf(drag.rowPath);
      const bands = droppableContainers.filter(isBetweenRows);
      const sameGroup = bands.filter(
        c => (c?.data?.current?.target?.containerPath || '') === dragContainer
      );
      const scoped = {
        ...args,
        droppableContainers: sameGroup.length ? sameGroup : bands,
      };
      return closestCenter(scoped);
    }
    // Item drag → everything except between-rows zones AND except the on-item
    // slot-fill zones (VIS-901 #4) AND except the in-container zones (VIS-974):
    // on-item is a LIBRARY-only affordance (fill / insert-before a slot), and
    // in-container is a LIBRARY-only affordance (append a sub-row). Neither has a
    // canvas-item router branch, so if the big in-container region — which
    // ENCLOSES every nested gap of a container — won the collision, a nested item
    // reorder would silently no-op (the "dead gesture" in nested layouts). A
    // canvas item reorder must always resolve to a gap (between-items /
    // end-of-row) at the correct depth, so we drop both slot-body zones here and
    // let `pointerWithin` pick the smallest gap under the cursor (the deepest
    // nested one wins, since its centre is nearest the pointer).
    // A FILLED slot's on-item zone is dropped (a canvas reorder must resolve to a
    // gap, never replace a populated slot), but an EMPTY slot's on-item zone is
    // KEPT (VIS-989): dropping a canvas item onto an empty slot fills it.
    const isFilledOnItem = c => {
      const t = c?.data?.current?.target;
      return t?.kind === 'on-item' && !t.empty;
    };
    const isInContainer = c => c?.data?.current?.target?.kind === 'in-container';
    droppableContainers = droppableContainers.filter(
      c => !isBetweenRows(c) && !isFilledOnItem(c) && !isInContainer(c)
    );
  }
  const scoped = { ...args, droppableContainers };
  const hits = pointerWithin(scoped);
  return hits.length > 0 ? hits : rectIntersection(scoped);
};

/** Read the live shell-level drag state ({ kind, name, level } | null). */
export const useWorkspaceDrag = () => useContext(WorkspaceDragContext)?.activeDrag ?? null;

/**
 * Read the shared `commitCanvasConfig(dashboardName, nextConfig, meta)` —
 * optimistic → validate → save (VIS-993). Surfaced for the canvas resize
 * overlay (VIS-777 / D-4), which persists width/height/weight gestures through
 * the SAME dashboard save path the DnD router uses. Returns a no-op outside
 * the provider.
 */
export const useCommitCanvasConfig = () =>
  useContext(WorkspaceDragContext)?.commitCanvasConfig ?? (() => {});

// Exposes the shell's `commitCanvasConfig` (optimistic → validate → save) to
// non-DnD canvas affordances — the "+ Add Row" template menu + empty-canvas CTA
// (VIS-794 / D-7, D-8) — so they reuse the SAME persistence path the DnD router
// uses, rather than re-implementing the save flow.
const WorkspaceCommitContext = createContext(null);

/** Read the shell's `commitCanvasConfig(dashboardName, nextConfig)` committer. */
export const useWorkspaceCommit = () => useContext(WorkspaceCommitContext);

/**
 * Provider for the shell's `commitCanvasConfig` committer. The full
 * <WorkspaceDndContext> wires this from its DnD provider; this thin wrapper lets
 * a non-DnD surface (or a focused component test) supply a committer without
 * mounting the whole dnd-kit shell.
 */
export const WorkspaceCommitProvider = ({ value, children }) => (
  <WorkspaceCommitContext.Provider value={value}>{children}</WorkspaceCommitContext.Provider>
);

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
 * @param {Function} deps.moveLevel  store action `(fromIndex, toIndex) => void`
 *                   for canvas level reorder (VIS-901 #5).
 * @param {Function} deps.commitCanvasConfig  applies a next dashboard config
 *                   (optimistic → validate → save) for canvas D-3 mutations:
 *                   `(dashboardName, nextConfig, meta) => void`.
 * @param {Function} deps.emit        telemetry emitter.
 * @returns {string} a short tag describing the routed action (for tests):
 *          'reassign_level' | 'ref_accepted' | 'ref_rejected' |
 *          'canvas_reorder_items' | 'canvas_reorder_rows' |
 *          'canvas_library_insert' | 'noop'.
 */
export const routeWorkspaceDragEnd = (
  event,
  { dashboards, projectDefaults, reassignDashboardLevel, moveLevel, commitCanvasConfig, emit }
) => {
  const { active, over } = event || {};
  if (!over) return 'noop';
  const dragData = active?.data?.current;
  const dropData = over?.data?.current;
  if (!dragData || !dropData) return 'noop';

  // ── Branch 0: ProjectEditor level → level reorder (VIS-901 #5) ───────────
  // A level-header drag carries `{ source: 'level', levelIndex }`; dropping it
  // on another level group (which exposes `levelIndex`) reorders the levels.
  if (dragData.source === 'level' && dropData.levelKey !== undefined) {
    const fromIndex = dragData.levelIndex;
    const toIndex = dropData.levelIndex;
    if (
      typeof fromIndex !== 'number' ||
      typeof toIndex !== 'number' ||
      fromIndex === toIndex ||
      toIndex < 0
    ) {
      return 'noop';
    }
    if (moveLevel) moveLevel(fromIndex, toIndex);
    emit &&
      emit('project_editor_action', { kind: 'level_reorder_dnd', from: fromIndex, to: toIndex });
    return 'level_reorder';
  }

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

  // ── Branch 2a: Library model → Relation ERD canvas (VIS-1006b) ───────────
  // A Library MODEL row dropped on the Relation ERD's canvas droppable (which
  // carries `{ kind: 'erd-canvas', onAddModel }`) adds that model to the ERD so
  // the user can author a new relation against it. Only models are accepted; any
  // other library type is a no-op (the ERD relates models, not charts/etc.).
  if (dragData.source === 'library' && dropData.kind === 'erd-canvas') {
    const isModel =
      dragData.type === 'model' ||
      dragData.type === 'csvScriptModel' ||
      dragData.type === 'localMergeModel';
    emit &&
      emit('relation_erd_add_model', {
        type: dragData.type,
        name: dragData.name,
        accepted: isModel,
      });
    if (!isModel) return 'erd_add_model_rejected';
    if (typeof dropData.onAddModel === 'function') {
      dropData.onAddModel(dragData.name);
    }
    return 'erd_add_model';
  }

  // ── Branch 2b: Pivot field → pivot shelf (VIS-1008) ──────────────────────
  // The Table `build` lens (PivotPlayground) registers its field pills + its
  // Columns/Rows/Values shelves with this same shared context (dnd-kit contexts
  // don't compose, so it can't mount its own). A pill drag carries
  // `{ source: 'pivot-field', field }`; a shelf droppable carries
  // `{ kind: 'pivot-field', shelf, onDropField }`. We hand the dropped field to
  // the shelf's `onDropField` so the playground mutates its own local draft.
  if (dragData.source === 'pivot-field' && dropData.kind === 'pivot-field') {
    const field = dragData.field || null;
    emit &&
      emit('pivot_field_drop', {
        shelf: dropData.shelf,
        field: field?.name,
      });
    if (field && typeof dropData.onDropField === 'function') {
      dropData.onDropField(field);
      return 'pivot_field_accepted';
    }
    return 'noop';
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
        // §3.4 canvas_action kind for a DnD item move.
        emit &&
          emit('canvas_action', {
            kind: 'move_item',
            rowPath: dragData.rowPath,
            from: fromIndex,
          });
        return 'canvas_reorder_items';
      }

      // Cross-row item move (VIS-973): drag an item + drop a `between-items`/
      // `end-of-row` target on a DIFFERENT row → move the item between rows,
      // preserving it (width included). The drop targets + collision already
      // surface other rows; only this branch + the move helper were missing.
      if (
        dragData.kind === 'item' &&
        (target.kind === 'between-items' || target.kind === 'end-of-row') &&
        target.rowPath !== dragData.rowPath
      ) {
        const next = moveItemBetweenRows(config, dragData.rowPath, dragData.itemIndex, target);
        if (next === config) return 'noop';
        commitCanvasConfig(dashboardName, next, { kind: 'move_item' });
        emit &&
          emit('canvas_action', {
            kind: 'move_item',
            rowPath: dragData.rowPath,
            from: dragData.itemIndex,
            toRowPath: target.rowPath,
          });
        return 'canvas_move_item';
      }

      // Fill an EMPTY slot (VIS-989): drag an item onto an empty slot's on-item
      // zone → the item fills the slot (a move; the empty placeholder is
      // discarded). The collision keeps only EMPTY on-item zones for item drags,
      // so a filled slot can never be silently overwritten.
      if (dragData.kind === 'item' && target.kind === 'on-item' && target.empty) {
        const targetItemPath = `${target.rowPath}.item.${target.index}`;
        const next = moveItemIntoSlot(
          config,
          dragData.rowPath,
          dragData.itemIndex,
          targetItemPath
        );
        if (next === config) return 'noop';
        commitCanvasConfig(dashboardName, next, { kind: 'fill_slot' });
        emit &&
          emit('canvas_action', {
            kind: 'fill_slot',
            rowPath: dragData.rowPath,
            from: dragData.itemIndex,
            toRowPath: target.rowPath,
            toIndex: target.index,
          });
        return 'canvas_fill_slot';
      }

      // Row reorder: drag a row + drop a `between-rows` target.
      if (dragData.kind === 'row' && target.kind === 'between-rows') {
        // Nested row (VIS-903): the dragged row lives in a container (its path
        // has a parent item) and the target band is scoped to the SAME container
        // (`target.containerPath`). Reorder the sibling sub-rows in place.
        const dragNested = parseNestedRowPath(dragData.rowPath);
        if (dragNested && target.containerPath === dragNested.containerPath) {
          const fromIndex = dragNested.rowIndex;
          let toIndex = target.index;
          if (toIndex > fromIndex) toIndex -= 1;
          const next = reorderRowsInContainer(config, dragNested.containerPath, fromIndex, toIndex);
          if (next === config) return 'noop';
          commitCanvasConfig(dashboardName, next, { kind: 'reorder_rows' });
          // §3.4 canvas_action kind for a DnD row move (nested container rows).
          emit &&
            emit('canvas_action', {
              kind: 'move_row',
              containerPath: dragNested.containerPath,
              from: fromIndex,
              to: toIndex,
            });
          return 'canvas_reorder_rows';
        }

        // Top-level row reorder: only when BOTH the drag is a top-level row and
        // the target is a top-level between-rows band (no containerPath). This
        // prevents a nested-row drag from landing on a top-level band (or vice
        // versa) and corrupting indices across nesting boundaries.
        if (!dragNested && !target.containerPath && typeof dragData.rowIndex === 'number') {
          const fromIndex = dragData.rowIndex;
          let toIndex = target.index;
          if (toIndex > fromIndex) toIndex -= 1;
          const next = reorderTopLevelRows(config, fromIndex, toIndex);
          if (next === config) return 'noop';
          commitCanvasConfig(dashboardName, next, { kind: 'reorder_rows' });
          // §3.4 canvas_action kind for a DnD row move (top-level rows).
          emit && emit('canvas_action', { kind: 'move_row', from: fromIndex, to: toIndex });
          return 'canvas_reorder_rows';
        }

        return 'noop';
      }

      return 'noop';
    }

    // 3b. Library → canvas insert (creates a new item referencing the object).
    if (dragData.source === 'library') {
      const newItem = buildLibraryItem(dragData.type, dragData.name);
      const next = insertItemAtTarget(config, target, newItem);
      if (next === config) return 'noop';
      commitCanvasConfig(dashboardName, next, { kind: 'library_insert' });
      // §3.4 canvas_action kind for a Library → canvas item insert.
      emit &&
        emit('canvas_action', {
          kind: 'add_item',
          source: 'library',
          type: dragData.type,
          name: dragData.name,
          target: target.kind,
        });
      return 'canvas_library_insert';
    }
  }

  return 'noop';
};

/**
 * Pure mapper for `onDragStart` (VIS-901 #5): turn the dnd-kit `active.data`
 * payload into the `activeDrag` shape the DragOverlay reads. Exported so the
 * mapping (especially the row-vs-item distinction for the preview pill) is
 * unit-testable without simulating a real drag. Returns `null` for no payload.
 *
 *   - dashboard tile        → { kind: 'dashboard', name, level, type }
 *   - library row           → { kind: 'library', name, type, data }
 *   - canvas ROW drag       → { kind: 'canvas', canvasKind: 'row', name }
 *   - canvas ITEM drag      → { kind: 'canvas', canvasKind: 'item', name, type, data }
 *
 * A ROW has no `refType`, so it gets a dedicated row preview rather than the
 * old chart pill (the bug this fixes: row drags showed a "chart" pill).
 */
export const mapDragStartData = data => {
  if (!data) return null;
  if (data.type === 'dashboard') {
    return { kind: 'dashboard', name: data.name, level: data.level, type: 'dashboard' };
  }
  if (data.source === 'library') {
    return { kind: 'library', name: data.name, type: data.type, data };
  }
  if (data.source === 'level') {
    return { kind: 'level', name: data.title || 'Level' };
  }
  if (data.source === 'pivot-field') {
    return { kind: 'pivot-field', name: data.field?.label || data.field?.name || 'Field' };
  }
  if (data.source === 'canvas') {
    if (data.kind === 'row') {
      return { kind: 'canvas', canvasKind: 'row', name: data.label || data.name || 'Row' };
    }
    const name = data.label || data.name;
    const type = data.refType || 'chart';
    return {
      kind: 'canvas',
      canvasKind: 'item',
      name,
      type,
      data: { source: 'library', type, name },
    };
  }
  return null;
};

const DashboardIcon = getTypeIcon('dashboard');
const DASH_COLORS = getTypeColors('dashboard');

/**
 * CanvasRowDragPreview — the DragOverlay pill for a canvas ROW drag (VIS-901 #5).
 * A row has no referenced object type, so it gets its own preview (a mulberry
 * "Row" pill with a stacked-bars glyph) rather than borrowing the chart pill.
 */
const CanvasRowDragPreview = ({ name }) => (
  <div
    data-testid="canvas-row-drag-preview"
    className="pointer-events-none inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 shadow-lg ring-1 ring-[#713b57]"
  >
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" className="text-[#713b57]">
      <g fill="currentColor">
        <rect x="1" y="2" width="12" height="3" rx="1" />
        <rect x="1" y="9" width="12" height="3" rx="1" />
      </g>
    </svg>
    <span className="text-[13px] font-medium text-gray-900">{name}</span>
    <span className="ml-1 inline-flex h-4 items-center rounded-sm bg-[#e2d7dd] px-1 text-[10px] font-bold uppercase tracking-wide text-[#5a2f45]">
      Row
    </span>
  </div>
);

/**
 * CanvasLevelDragPreview — the DragOverlay pill for a level-header drag
 * (VIS-901 #5). A simple mulberry "Level" pill with the level title.
 */
const CanvasLevelDragPreview = ({ name }) => (
  <div
    data-testid="level-drag-preview"
    className="pointer-events-none inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 shadow-lg ring-1 ring-[#713b57]"
  >
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" className="text-[#713b57]">
      <g fill="currentColor">
        <rect x="1" y="2" width="12" height="2.5" rx="1" />
        <rect x="1" y="6" width="9" height="2.5" rx="1" />
        <rect x="1" y="10" width="6" height="2.5" rx="1" />
      </g>
    </svg>
    <span className="text-[13px] font-medium text-gray-900">{name}</span>
    <span className="ml-1 inline-flex h-4 items-center rounded-sm bg-[#e2d7dd] px-1 text-[10px] font-bold uppercase tracking-wide text-[#5a2f45]">
      Level
    </span>
  </div>
);

/**
 * PivotFieldDragPreview — the DragOverlay pill for a pivot field drag
 * (VIS-1008). A compact mulberry-ringed chip with the field's label, matching
 * the field-list pill so "the drag preview IS the source pill".
 */
const PivotFieldDragPreview = ({ name }) => (
  <div
    data-testid="pivot-field-drag-preview"
    className="pointer-events-none inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-900 shadow-lg ring-1 ring-[#713b57]"
  >
    <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" className="text-[#713b57]">
      <g fill="currentColor">
        <rect x="1" y="2" width="12" height="3" rx="1" />
        <rect x="1" y="9" width="12" height="3" rx="1" />
      </g>
    </svg>
    {name}
  </div>
);

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
  const moveLevel = useStore(s => s.moveLevel);
  const saveDashboard = useStore(s => s.saveDashboard);
  const updateDashboardConfigOptimistic = useStore(s => s.updateDashboardConfigOptimistic);

  // `activeDrag` mirrors the dnd-kit `active` payload in a shape both overlays
  // and consumers (ProjectEditor) can read: `{ kind, name, level, type }`.
  const [activeDrag, setActiveDrag] = useState(null);

  // Commit a canvas-driven config mutation (D-3): optimistically swap the
  // store config so the canvas + Outline reflect it immediately, then GATE
  // persistence (VIS-993 §3). The canvas transforms (canvasReorder) produce
  // BORN-valid configs, so the gate — $defs schema (validateAgainstSchema)
  // plus the leaf mutual-exclusion check the JSON schema cannot express — is
  // defense-in-depth: an invalid config is never handed to saveDashboard
  // (sanitizeDashboardConfig is retired; nothing repairs the payload). This is
  // the SAME contract RightRailEditPanel.persistConfig applies on the
  // structure-form path.
  const commitCanvasConfig = useCallback(
    (dashboardName, nextConfig) => {
      if (!dashboardName) return;
      if (updateDashboardConfigOptimistic) {
        updateDashboardConfigOptimistic(dashboardName, nextConfig);
      }
      const persist = blocked => {
        if (blocked) {
          emitWorkspaceEvent('canvas_commit_blocked', {
            name: dashboardName,
            errors: blocked.errors.length,
          });
          return;
        }
        if (typeof saveDashboard === 'function') {
          saveDashboard(dashboardName, nextConfig);
        }
      };
      const exclusivity = checkLeafExclusivity(nextConfig);
      if (!exclusivity.valid) {
        persist(exclusivity);
        return;
      }
      // Sync schema fast path; pre-load (null) defers to the async check.
      const sync = validateRecordConfigSync('dashboard', nextConfig);
      if (sync) {
        persist(sync.valid ? null : sync);
        return;
      }
      validateRecordConfig('dashboard', nextConfig).then(result =>
        persist(result.valid ? null : result)
      );
    },
    [updateDashboardConfigOptimistic, saveDashboard]
  );

  // Context value: the live drag state PLUS the shared commit path. Consumers
  // read `useWorkspaceDrag()` (drag only) or `useCommitCanvasConfig()` (commit
  // only); both unwrap this object so neither re-renders on the other's change.
  const contextValue = useMemo(
    () => ({ activeDrag, commitCanvasConfig }),
    [activeDrag, commitCanvasConfig]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const projectDefaults = useMemo(
    () => defaults || project?.config?.defaults || project?.project_json?.defaults || null,
    [defaults, project]
  );

  const handleDragStart = useCallback(event => {
    setActiveDrag(mapDragStartData(event.active?.data?.current));
  }, []);

  const handleDragCancel = useCallback(() => setActiveDrag(null), []);

  const handleDragEnd = useCallback(
    event => {
      setActiveDrag(null);
      routeWorkspaceDragEnd(event, {
        dashboards,
        projectDefaults,
        reassignDashboardLevel,
        moveLevel,
        commitCanvasConfig,
        emit: emitWorkspaceEvent,
      });
    },
    [dashboards, projectDefaults, reassignDashboardLevel, moveLevel, commitCanvasConfig]
  );

  return (
    <WorkspaceDragContext.Provider value={contextValue}>
      <WorkspaceCommitContext.Provider value={commitCanvasConfig}>
      <DndContext
        sensors={sensors}
        collisionDetection={workspaceCollisionDetection}
        // Re-measure droppables continuously while dragging. The canvas drop
        // zones are absolutely-positioned overlays that the affordance layer
        // rebuilds on reflow (overlay mount / ResizeObserver), so a rect measured
        // once at drag-start goes stale and collisions miss. `Always` keeps the
        // measured rects in sync with the live overlay positions.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeDrag?.kind === 'dashboard' ? (
            <DashboardTilePreview name={activeDrag.name} />
          ) : activeDrag?.kind === 'pivot-field' ? (
            <PivotFieldDragPreview name={activeDrag.name} />
          ) : activeDrag?.kind === 'level' ? (
            <CanvasLevelDragPreview name={activeDrag.name} />
          ) : activeDrag?.kind === 'canvas' && activeDrag.canvasKind === 'row' ? (
            // Canvas ROW drag → a dedicated row pill (VIS-901 #5). A row has no
            // refType, so it must NOT borrow the chart pill.
            <CanvasRowDragPreview name={activeDrag.name} />
          ) : activeDrag?.kind === 'library' || activeDrag?.kind === 'canvas' ? (
            // Library drags + canvas ITEM drags reuse the SAME pill shape as a
            // Library drag (architecture §2.6: "the drag preview IS the source pill").
            <LibraryDragPreview data={activeDrag.data} />
          ) : null}
        </DragOverlay>
      </DndContext>
      </WorkspaceCommitContext.Provider>
    </WorkspaceDragContext.Provider>
  );
};

export default WorkspaceDndContext;
