import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PiPlus, PiSidebar } from 'react-icons/pi';
import LibrarySearch from './LibrarySearch';
import LibraryFilter from './LibraryFilter';
import LibrarySubsection from './LibrarySubsection';
import useLibraryData from './useLibraryData';
import useLibraryFilter from './useLibraryFilter';
import { LAYOUT_TYPES, DATA_TYPES, getTypeDef } from './LibraryRow';
import useStore from '../../../../stores/store';
import { isLibrarySubsectionCollapsed } from '../../../../stores/libraryPrefsStore';
import { useWorkspaceScope } from '../useWorkspaceScope';
import { emitWorkspaceEvent } from '../telemetry';
import ViewSwitcher from '../ViewSwitcher';
import { useConfirm } from '../../../common/ConfirmDialog';
import { ObjectStatus } from '../../../../stores/store';
import { generateUniqueName } from '../../../../utils/uniqueName';

// Row Delete -> the per-type store action. Every one has the same shape (API
// call, refetch, checkCommitStatus) and returns `{ success, error }`, so the
// row needs no per-type branching beyond picking the name.
//
// The row's Delete used to be telemetry-only: `handleContextAction` emitted the
// event and had no `delete` branch at all, so confirming the dialog did
// nothing (VIS-1234).
const DELETE_ACTION = {
  source: 'deleteSource',
  model: 'deleteModel',
  dimension: 'deleteDimension',
  metric: 'deleteMetric',
  relation: 'deleteRelation',
  insight: 'deleteInsight',
  chart: 'deleteChart',
  table: 'deleteTable',
  markdown: 'deleteMarkdown',
  input: 'deleteInput',
  dashboard: 'deleteDashboard',
};

/**
 * Library — VIS-769 / Track C C1 (+ C2 / C3).
 *
 * The Library left rail. One flat, searchable list of per-type collapsible
 * subsections (Data Layer first, then Layout Items), with a SINGLE shared
 * search input + a compact filter dropdown at the top (workspace-tweaks:
 * replaces the two stacked "Layout Items" / "Data Layer" section headers —
 * each of which used to carry its own search box).
 *
 *   - Data Layer   — click-to-edit types (Sources · Models · Dimensions ·
 *                    Metrics · Relations · Insights).
 *   - Layout Items — canvas-droppable types (Charts · Tables · Markdowns ·
 *                    Inputs · Dashboards); rows are dnd-kit drag sources.
 *
 * The `<LibraryFilter>` dropdown filters the flat list additively (multi-
 * select, union): a group option narrows to Data Layer or Layout Items, a
 * type option narrows to one type, and selected values show as removable
 * chips. The shared search filters row names across everything visible.
 *
 * The single-PR Library bundles C1 + C2 + C3:
 *   - C1 (VIS-769) — shell + sections + per-type subsections + rows.
 *   - C2 (VIS-773) — per-section search + type-filter chips + persisted
 *                    section / subsection collapse.
 *   - C3 (VIS-776) — drag sources + LibraryRowFlipPopover.
 *
 * Selection (which row binds the Edit panel) is wired into the workspace
 * store via `openWorkspaceTab` — clicking a row opens (or focuses) a tab
 * for the object. Track G wires the actual Edit form into the right rail.
 *
 * Creation is via the single "+ New" menu in the Library header (the
 * per-subsection inline "+ New X" CTAs were removed as redundant with it);
 * `handleCreate` drafts a minimal valid config and opens its tab, firing the
 * `inline_create_used` telemetry event.
 *
 * The drag-preview pill itself is rendered by the workspace `<DragOverlay>`
 * via `<LibraryDragPreview>` — see Track D for the `<DndContext>` wiring.
 */

// Tab opens route by the row's REAL type. Rows may carry a `canonicalType`
// that differs from the displayed `type`, in which case the right rail's
// per-type routing (and record resolution) follows the canonical one.
const routeType = obj => obj.canonicalType || obj.type;

// ux-audit.md "Left-rail footer help text is context-blind" + "Sidebar
// footer shows dashboard-canvas help text ('Drag a layout item onto the
// canvas...') on the Explorer surface" — the footer used to hardcode the
// dashboard-canvas hint on every surface, including Explorer/exploration
// screens where there is no canvas to drag onto at all. Scoped by
// `useWorkspaceScope()`'s own `scope`/`selectedItem` (already the single
// source of truth every other Library behavior reads).
export function libraryFooterHint(scope) {
  if (scope?.selectedItem?.type === 'exploration') {
    return 'Drag a column onto a chart field to map it. Click a data object to add it to your exploration.';
  }
  if (scope?.scope === 'explorer') {
    return 'Click a source tile to start exploring, or click an existing object to explore it.';
  }
  if (scope?.scope === 'dashboard') {
    return 'Drag a layout item onto the canvas. Click a data object to edit it.';
  }
  if (scope?.scope === 'semantic-layer') {
    return 'Click a model on the diagram, or a data object here, to edit it.';
  }
  return 'Click a data object to edit it.';
}

const Library = () => {
  const data = useLibraryData();
  const scope = useWorkspaceScope();

  // Workspace actions — read from the store directly so the Library has no
  // required props (the parent LeftRail mounts it as `<Library />`).
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const openWorkspaceTabBackground = useStore(s => s.openWorkspaceTabBackground);
  // "Show lineage" opens the object on its Lineage lens (same mechanism the
  // lineage-node click / MiniLineageCard use).
  const setWorkspaceLensIntent = useStore(s => s.setWorkspaceLensIntent);
  const setWorkspaceLens = useStore(s => s.setWorkspaceLens);
  const createExploration = useStore(s => s.createExploration);
  const buildExplorationSeedState = useStore(s => s.buildExplorationSeedState);
  const addObjectToActiveExploration = useStore(s => s.addObjectToActiveExploration);
  const saveChart = useStore(s => s.saveChart);
  const charts = useStore(s => s.charts);
  // VIS-1067: "Add to exploration" is only offered while an exploration tab
  // is the ACTIVE one — that's the exploration whose live legacy working
  // state `addObjectToActiveExploration` actually mutates.
  const canAddToExploration = useStore(s => s.workspaceActiveObject?.type === 'exploration');
  const toggleLeftCollapsed = useStore(s => s.toggleWorkspaceLeftCollapsed);
  const setLibrarySubsectionCollapsed = useStore(s => s.setLibrarySubsectionCollapsed);

  // #8: reveal the active object's row — expand its type subsection so a
  // selection isn't hidden in a collapsed group, and scroll it into view.
  //
  // This used to read `workspaceActiveObject` off `getState()` with only
  // `setLibrarySubsectionCollapsed` in the dep array, so it fired ONCE on
  // mount and never again: selecting a row while the rail was already open
  // never scrolled to it. Subscribing to the active object's primitives (not
  // the object, whose identity churns on every store write) makes it track the
  // selection. Mount is just the `null → type` transition, so the
  // rail-expansion case it was written for still works.
  const activeType = useStore(s => s.workspaceActiveObject?.type || null);
  const activeName = useStore(s => s.workspaceActiveObject?.name || null);
  useEffect(() => {
    if (!activeType || !activeName) return undefined;
    if (!LAYOUT_TYPES.includes(activeType) && !DATA_TYPES.includes(activeType)) return undefined;
    // Only write when the subsection is actually collapsed. Now that this
    // effect runs on every selection change (not once per mount), an
    // unconditional call would mint a new `libraryCollapsedSubsections` object
    // every time — re-rendering every subscriber and, because the slice is
    // persisted, writing localStorage on each click.
    if (isLibrarySubsectionCollapsed(useStore.getState().libraryCollapsedSubsections, activeType)) {
      setLibrarySubsectionCollapsed(activeType, false);
    }
    // Best-effort scroll the selected row into view once it renders.
    const raf = requestAnimationFrame(() => {
      try {
        const el = document.querySelector(
          `[data-testid="library-row-${activeType}-${activeName}"]`
        );
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'nearest' });
        }
      } catch {
        /* selector can't match an exotic name — the expand alone still reveals it */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeType, activeName, setLibrarySubsectionCollapsed]);

  // The active workspace tab's id is the selected row's id — both are
  // `${type}:${name}`. Surfacing it here drives LibraryRow's mulberry-bar +
  // tinted-bg selected state through the section → subsection → row chain.
  const selectedRowId = useStore(s => s.workspaceActiveTabId);

  // One shared search + an additive (multi-select) filter dropdown for the
  // flat list.
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState([]); // Array<{ kind: 'group'|'type', value }>

  const toggleFilter = useCallback(sel => {
    setFilters(prev => {
      const exists = prev.some(f => f.kind === sel.kind && f.value === sel.value);
      return exists
        ? prev.filter(f => !(f.kind === sel.kind && f.value === sel.value))
        : [...prev, sel];
    });
  }, []);
  const clearFilters = useCallback(() => setFilters([]), []);

  // Flat map of every type -> its rows, across both groups.
  const rowsByType = useMemo(
    () => ({ ...data.layoutItems, ...data.dataLayer }),
    [data.layoutItems, data.dataLayer]
  );
  // Data Layer first, then Layout Items (VIS thread: data elements before
  // layout items).
  const allTypes = useMemo(() => [...DATA_TYPES, ...LAYOUT_TYPES], []);
  const allRows = useMemo(
    () => allTypes.flatMap(t => rowsByType[t] || []),
    [allTypes, rowsByType]
  );

  const activeGroups = filters.filter(f => f.kind === 'group').map(f => f.value);
  const activeTypes = filters.filter(f => f.kind === 'type').map(f => f.value);
  const anyFilter = filters.length > 0;

  // Search filters row names; the pills gate which type subsections show as an
  // ADDITIVE union — a type appears if its own type pill OR its group pill is
  // active. No active filter shows everything.
  const filteredRows = useLibraryFilter({ rows: allRows, search });
  const searchActive = search.trim().length > 0;

  const GROUP_TYPES = { layout: LAYOUT_TYPES, data: DATA_TYPES };
  const typeVisible = t => {
    if (!anyFilter) return true;
    if (activeTypes.includes(t)) return true;
    if (activeGroups.includes('layout') && GROUP_TYPES.layout.includes(t)) return true;
    if (activeGroups.includes('data') && GROUP_TYPES.data.includes(t)) return true;
    return false;
  };
  // A search with zero matches for a type hides that subsection to keep it tidy.
  const renderedTypes = allTypes
    .filter(typeVisible)
    .map(typeKey => ({ typeKey, rows: filteredRows.filter(r => r.type === typeKey) }))
    .filter(({ rows }) => !(searchActive && rows.length === 0));

  // Row counts for the filter-menu option badges.
  const groupCounts = useMemo(
    () => ({
      layout: LAYOUT_TYPES.reduce((n, t) => n + (rowsByType[t]?.length || 0), 0),
      data: DATA_TYPES.reduce((n, t) => n + (rowsByType[t]?.length || 0), 0),
    }),
    [rowsByType]
  );
  const typeCounts = useMemo(
    () => Object.fromEntries(allTypes.map(t => [t, rowsByType[t]?.length || 0])),
    [allTypes, rowsByType]
  );

  // Header "+ New" menu — the left-nav entry point for creating any object
  // type (the per-type "+ New X" buttons live inside each subsection).
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef(null);
  useEffect(() => {
    if (!newMenuOpen) return undefined;
    const onPointerDown = e => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target)) {
        setNewMenuOpen(false);
      }
    };
    const onKeyDown = e => {
      if (e.key === 'Escape') setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [newMenuOpen]);

  // Shared inline-create flow (stores/inlineCreateStore.js): drafts a
  // minimal valid config for the type, then we open it as a workspace tab so
  // the right-rail Edit form is the editing surface. (The old per-type
  // `openCreate*Modal` flags had no mounted modal in the Workspace — every
  // "+ New X" was a silent no-op.)
  const createWorkspaceObject = useStore(s => s.createWorkspaceObject);
  // A create with an unmet precondition (a relation needs two models) reports
  // it through the shared workspace toast rather than failing silently.
  const showWorkspaceToast = useStore(s => s.showWorkspaceToast);
  // Resolved at call time rather than subscribed per-type: there are eleven
  // delete actions and a row only ever needs the one matching its type.
  const storeApi = useStore;
  const closeWorkspaceTab = useStore(s => s.closeWorkspaceTab);
  const { confirm, ConfirmDialog } = useConfirm();

  const handleRowClick = useCallback(
    obj => {
      const type = routeType(obj);
      if (openWorkspaceTab) {
        openWorkspaceTab({
          id: `${type}:${obj.name}`,
          type,
          name: obj.name,
        });
      }
      emitWorkspaceEvent('library_row_selected', {
        type: obj.type,
        name: obj.name,
      });
    },
    [openWorkspaceTab]
  );

  const handleRestore = useCallback(
    async (type, name) => {
      const restoreFn = storeApi.getState().restoreDeleted;
      if (typeof restoreFn !== 'function') return;
      await restoreFn(type, name);
    },
    [storeApi]
  );

  const handleDelete = useCallback(
    async (type, name, status) => {
      // The two deletes are genuinely different and the confirm has to say so.
      //
      // A published object is TOMBSTONED: the YAML is untouched until commit,
      // and Restore in this menu brings it back. A never-published one has no
      // published version to fall back to, so it is removed outright and there
      // is nothing to restore — telling the user that afterwards would be too
      // late.
      const isDraftOnly = status === ObjectStatus.NEW;
      const ok = await confirm({
        title: `Delete ${name}?`,
        body: isDraftOnly
          ? `This ${type} has never been committed, so deleting it removes it immediately. This can't be undone.`
          : `This marks the ${type} for deletion. The project keeps it until you commit, and you can restore it from this menu before then.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;

      const actionName = DELETE_ACTION[type];
      const deleteFn = actionName ? storeApi.getState()[actionName] : null;
      if (typeof deleteFn !== 'function') return;

      const result = await deleteFn(name);
      if (result?.success === false) return;

      // The object is gone from the tree, so a tab still open on it would sit
      // there resolving a record that no longer exists.
      if (closeWorkspaceTab) closeWorkspaceTab(`${type}:${name}`);
    },
    [confirm, storeApi, closeWorkspaceTab]
  );

  const handleContextAction = useCallback(
    (action, obj) => {
      emitWorkspaceEvent('library_row_context_action', {
        type: obj.type,
        name: obj.name,
        action,
      });
      const type = routeType(obj);
      if (action === 'wrapInChart' && saveChart) {
        // B2: the advertised affordance existed and was a silent no-op. A
        // wrap creates a chart whose only content is this insight — the
        // hyphenated cascade name (#615) with -2 disambiguation (#620).
        const existingChartNames = (charts || []).map(chart => chart.name);
        const chartName = generateUniqueName(`${obj.name}-chart`, existingChartNames, {
          separator: '-',
        });
        saveChart(chartName, { insights: [`ref(${obj.name})`] }).then(result => {
          if (result?.success && openWorkspaceTab) {
            openWorkspaceTab({ id: `chart:${chartName}`, type: 'chart', name: chartName });
          }
        });
        return;
      }
      if (action === 'edit' && openWorkspaceTab) {
        openWorkspaceTab({ id: `${type}:${obj.name}`, type, name: obj.name });
      } else if (action === 'openInNewTab' && openWorkspaceTabBackground) {
        openWorkspaceTabBackground({
          id: `${type}:${obj.name}`,
          type,
          name: obj.name,
        });
      } else if (action === 'showLineage' && openWorkspaceTab) {
        // Open the object AND land on its Lineage lens. Per-object panes track
        // their lens locally and ignore the store lens, so a non-dashboard
        // subject needs the one-shot object-scoped intent to actually open on
        // Lineage; setWorkspaceLens covers the dashboard pane. Mirrors
        // MiniLineageCard's `handleOpenNode` / LineageCanvas node-open.
        if (setWorkspaceLensIntent && type !== 'dashboard') {
          setWorkspaceLensIntent({ objectKey: `${type}:${obj.name}`, lens: 'lineage' });
        }
        openWorkspaceTab({ id: `${type}:${obj.name}`, type, name: obj.name });
        if (setWorkspaceLens) setWorkspaceLens('lineage');
      } else if (action === 'exploreThis' && createExploration && openWorkspaceTab) {
        const seed = { type, name: obj.name };
        const legacyStateOverride = buildExplorationSeedState
          ? buildExplorationSeedState(seed)
          : null;
        createExploration(seed, null, legacyStateOverride).then(result => {
          if (result?.success) {
            openWorkspaceTab({ id: `exploration:${result.id}`, type: 'exploration', name: result.id });
            emitWorkspaceEvent('explore_this_used', { source_type: type });
          }
        });
      } else if (action === 'addToExploration' && addObjectToActiveExploration) {
        addObjectToActiveExploration({ type, name: obj.name, parentModel: obj.parentModel });
      } else if (action === 'delete') {
        handleDelete(type, obj.name, obj.status);
      } else if (action === 'restore') {
        handleRestore(type, obj.name);
      }
    },
    [
      openWorkspaceTab,
      openWorkspaceTabBackground,
      setWorkspaceLensIntent,
      setWorkspaceLens,
      createExploration,
      buildExplorationSeedState,
      addObjectToActiveExploration,
      saveChart,
      charts,
      handleDelete,
      handleRestore,
    ]
  );

  const handleCreate = useCallback(
    (typeKey, source = 'library') => {
      emitWorkspaceEvent('inline_create_used', { source, kind: typeKey });
      // J-2 (VIS-778) → Explore 2.0 Phase 3b cutover (B5)/delta-review fix:
      // "+ New Chart" inside a scoped dashboard used to build the dead
      // pre-cutover `/workspace/dashboard/:name/explorer?return_to=…` QUERY
      // STRING — `DashboardExplorerRedirect` (LocalRouter.jsx) only ever read
      // the PATH segment, so `slot=new` silently dropped and the redirect's
      // own `return_to: {dashboard}` (no querystring parsing) did the real
      // work anyway. Mint the return_to-carrying exploration directly instead
      // — the SAME call `CanvasAddRow.jsx`'s "+ New Chart" and the dashboard-
      // scoped redirect route both use — so both entry points behave
      // identically. Outside a dashboard scope there's no slot to return to,
      // so draft an empty chart instead (unchanged).
      if (typeKey === 'chart' && scope.dashboardName) {
        if (!createExploration || !openWorkspaceTab) return;
        createExploration(null, { dashboard: scope.dashboardName }).then(result => {
          if (result?.success) {
            openWorkspaceTab({
              id: `exploration:${result.id}`,
              type: 'exploration',
              name: result.id,
            });
          }
        });
        return;
      }
      if (!createWorkspaceObject) return;
      createWorkspaceObject(typeKey).then(result => {
        if (result?.success && result.name && openWorkspaceTab) {
          openWorkspaceTab({
            id: `${typeKey}:${result.name}`,
            type: typeKey,
            name: result.name,
          });
          return;
        }
        // A create that cannot happen has to SAY so. This used to fall through
        // silently, which is what made "+ New" read as a dead button (VIS-1237)
        // rather than an action with a precondition.
        if (result?.error && showWorkspaceToast) {
          showWorkspaceToast(result.error);
        }
      });
    },
    [
      createWorkspaceObject,
      openWorkspaceTab,
      createExploration,
      scope.dashboardName,
      showWorkspaceToast,
    ]
  );

  // "+ New" menu pick — every type, relation included, drafts through the one
  // shared inline-create flow and opens in the edit panel. Relations used to be
  // special-cased into opening the Semantic Layer instead, which read as "+ New
  // does nothing" (VIS-1237): a relation IS templatable, seeded with the
  // project's first two models, and the ERD stays the way to author one
  // visually rather than the only way.
  const handleNewPick = useCallback(
    typeKey => {
      setNewMenuOpen(false);
      handleCreate(typeKey, 'library-menu');
    },
    [handleCreate]
  );

  return (
    <aside
      data-testid="workspace-left-rail"
      data-collapsed="false"
      className="relative flex h-full flex-col overflow-visible border-r border-gray-200 bg-white text-gray-800"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 px-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-gray-900">Library</span>
          <span className="text-[11px] text-gray-400">· project</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative" ref={newMenuRef}>
            <button
              type="button"
              onClick={() => setNewMenuOpen(open => !open)}
              title="New object"
              aria-label="New object"
              aria-expanded={newMenuOpen}
              data-testid="library-new-object-button"
              // B14 part 1 (Explore 2.0 Phase 2): the onboarding manifest's
              // `connect_source`/`build_dashboard` items target
              // `source-create-button` — the old Editor FAB this pointed at
              // no longer exists; the Library's "New" menu is its live
              // equivalent (creates a source, dashboard, or any other type).
              data-onb-target="source-create-button"
              className="inline-flex h-6 items-center gap-0.5 rounded px-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary-100/60"
            >
              <PiPlus className="h-3.5 w-3.5" /> New
            </button>
            {newMenuOpen && (
              <div
                data-testid="library-new-object-menu"
                className="absolute right-0 top-7 z-50 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
              >
                {/* Grouped in the SAME order the sidebar body renders (Data
                    Layer first — sources → models → …, then Layout Items). The
                    menu is already "New", so items drop the redundant "New "
                    prefix. */}
                {[
                  { label: 'Data Layer', types: DATA_TYPES },
                  { label: 'Layout Items', types: LAYOUT_TYPES },
                ].map((group, groupIndex) => (
                  <div key={group.label} data-testid={`library-new-group-${group.label}`}>
                    {groupIndex > 0 && <div className="my-1 border-t border-gray-100" />}
                    <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {group.label}
                    </div>
                    {group.types.map(typeKey => {
                      const def = getTypeDef(typeKey);
                      const Icon = def.icon;
                      return (
                        <button
                          key={typeKey}
                          type="button"
                          data-testid={`library-new-object-${typeKey}`}
                          onClick={() => handleNewPick(typeKey)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-gray-800 hover:bg-gray-50"
                        >
                          {Icon && <Icon style={{ fontSize: 14 }} className="shrink-0" />}
                          {def.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleLeftCollapsed}
            title="Collapse left rail"
            aria-label="Collapse left rail"
            data-testid="workspace-left-rail-collapse"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <PiSidebar className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Destination switcher — Project / Semantic Layer / Explorer (D1,
          Explore 2.0 Phase 0). Replaces the old per-surface button row: these
          are real workspace VIEWS now (`workspaceActiveView`), not bare
          route navigations, so clicking one activates live workspace state
          exactly like every other selection instead of leaving the shell. */}
      <ViewSwitcher />

      {/* One shared search + a compact filter dropdown for the whole flat list. */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-gray-200 px-3 py-2">
        <LibrarySearch
          sectionKey="library"
          value={search}
          onChange={setSearch}
          placeholder="Search the library…"
          inputTestId="library-search"
        />
        <LibraryFilter
          groups={[{ key: 'data' }, { key: 'layout' }]}
          types={allTypes}
          groupCounts={groupCounts}
          typeCounts={typeCounts}
          value={filters}
          onToggle={toggleFilter}
          onClear={clearFilters}
        />
      </div>

      {/* Flat list of per-type subsections. */}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-1.5 py-2">
        {renderedTypes.map(({ typeKey, rows }) => (
          <LibrarySubsection
            key={typeKey}
            typeKey={typeKey}
            rows={rows}
            selectedRowId={selectedRowId}
            onRowClick={handleRowClick}
            onContextAction={handleContextAction}
            canAddToExploration={canAddToExploration}
          />
        ))}
        {renderedTypes.length === 0 && (
          <p
            className="px-3 py-4 text-center text-[11.5px] italic text-gray-400"
            data-testid="library-empty"
          >
            No objects match “{search.trim()}”.
          </p>
        )}
      </div>

      <div
        data-testid="library-footer-hint"
        className="shrink-0 border-t border-gray-200 px-3 py-2 text-[11px] text-gray-400"
      >
        {libraryFooterHint(scope)}
      </div>
      {ConfirmDialog}
    </aside>
  );
};

export default Library;
