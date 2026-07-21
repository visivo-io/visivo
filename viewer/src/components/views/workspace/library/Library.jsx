import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PiPlus, PiSidebar } from 'react-icons/pi';
import LibrarySearch from './LibrarySearch';
import LibraryFilter from './LibraryFilter';
import LibrarySubsection from './LibrarySubsection';
import useLibraryData from './useLibraryData';
import useLibraryFilter from './useLibraryFilter';
import { LAYOUT_TYPES, DATA_TYPES, getTypeDef } from './LibraryRow';
import useStore from '../../../../stores/store';
import { useWorkspaceScope } from '../useWorkspaceScope';
import { emitWorkspaceEvent } from '../telemetry';
import ViewSwitcher from '../ViewSwitcher';

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

// Tab opens route by the row's REAL type. Model rows present as `type:
// 'model'` (one icon, one subsection) but carry `canonicalType`
// ('csvScriptModel' / 'localMergeModel') so the right rail's per-type
// routing (and record resolution) engages instead of resolving a null
// record in `models` and falling into create-SQL-model mode.
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
  const createExploration = useStore(s => s.createExploration);
  const buildExplorationSeedState = useStore(s => s.buildExplorationSeedState);
  const addObjectToActiveExploration = useStore(s => s.addObjectToActiveExploration);
  // VIS-1067: "Add to exploration" is only offered while an exploration tab
  // is the ACTIVE one — that's the exploration whose live legacy working
  // state `addObjectToActiveExploration` actually mutates.
  const canAddToExploration = useStore(s => s.workspaceActiveObject?.type === 'exploration');
  const toggleLeftCollapsed = useStore(s => s.toggleWorkspaceLeftCollapsed);
  const setLibrarySubsectionCollapsed = useStore(s => s.setLibrarySubsectionCollapsed);

  // #8: when the rail expands (this Library mounts), reveal the active object's
  // row — expand its type subsection so a selection made while the nav was
  // minimized isn't hidden in a collapsed group, and scroll it into view. (The
  // flat list has no section-collapse to reverse anymore.)
  useEffect(() => {
    const active = useStore.getState().workspaceActiveObject;
    if (!active?.type) return;
    // All model variants live in the single "model" subsection.
    const subType = ['csvScriptModel', 'localMergeModel'].includes(active.type)
      ? 'model'
      : active.type;
    if (!LAYOUT_TYPES.includes(subType) && !DATA_TYPES.includes(subType)) return;
    setLibrarySubsectionCollapsed(subType, false);
    // Best-effort scroll the selected row into view once it renders.
    requestAnimationFrame(() => {
      try {
        const el = document.querySelector(
          `[data-testid="library-row-${subType}-${active.name}"]`
        );
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'nearest' });
        }
      } catch {
        /* selector can't match an exotic name — the expand alone still reveals it */
      }
    });
  }, [setLibrarySubsectionCollapsed]);

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

  const handleContextAction = useCallback(
    (action, obj) => {
      emitWorkspaceEvent('library_row_context_action', {
        type: obj.type,
        name: obj.name,
        action,
      });
      // VIS-811 / O-2: the open actions are live; `wrapInChart`/`showLineage`/
      // `delete` stay telemetry-only until their tracks wire them. VIS-1067
      // wires `exploreThis`/`addToExploration`.
      const type = routeType(obj);
      if (action === 'edit' && openWorkspaceTab) {
        openWorkspaceTab({ id: `${type}:${obj.name}`, type, name: obj.name });
      } else if (action === 'openInNewTab' && openWorkspaceTabBackground) {
        openWorkspaceTabBackground({
          id: `${type}:${obj.name}`,
          type,
          name: obj.name,
        });
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
      }
    },
    [
      openWorkspaceTab,
      openWorkspaceTabBackground,
      createExploration,
      buildExplorationSeedState,
      addObjectToActiveExploration,
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
        }
      });
    },
    [createWorkspaceObject, openWorkspaceTab, createExploration, scope.dashboardName]
  );

  // "+ New" menu pick. Everything templatable goes through `handleCreate`; a
  // relation can't be templated (its condition needs two real models), so
  // "Relation" opens the Semantic Layer, where you author it by connecting two
  // models — the same surface MiddlePane opens for relations.
  const handleNewPick = useCallback(
    typeKey => {
      setNewMenuOpen(false);
      if (typeKey === 'relation') {
        openWorkspaceTab({
          id: 'semantic-layer:semantic-layer',
          type: 'semantic-layer',
          name: 'semantic-layer',
        });
        return;
      }
      handleCreate(typeKey, 'library-menu');
    },
    [openWorkspaceTab, handleCreate]
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
                {/* Grouped like the sidebar (Layout Items · Data Layer). The menu
                    is already "New", so items drop the redundant "New " prefix. */}
                {[
                  { label: 'Layout Items', types: LAYOUT_TYPES },
                  { label: 'Data Layer', types: DATA_TYPES },
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
    </aside>
  );
};

export default Library;
