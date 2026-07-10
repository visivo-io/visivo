import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiPlus, PiSidebar } from 'react-icons/pi';
import LibrarySection from './LibrarySection';
import useLibraryData from './useLibraryData';
import { LAYOUT_TYPES, DATA_TYPES, getTypeDef } from './LibraryRow';
import useStore from '../../../../stores/store';
import { useWorkspaceScope } from '../useWorkspaceScope';
import { emitWorkspaceEvent } from '../telemetry';

/**
 * Library — VIS-769 / Track C C1 (+ C2 / C3).
 *
 * The Library left rail. Ports the C-1 `library.jsx` blueprint into
 * production React: two stacked, independently-collapsible sections that
 * replace the legacy `/editor` flat list.
 *
 *   - Layout Items — canvas-droppable types (Charts · Tables · Markdowns ·
 *                    Inputs). Subtitle "Drag onto the canvas".
 *   - Data Layer   — click-to-edit types (Sources · Models · Dimensions ·
 *                    Metrics · Relations · Insights). Subtitle
 *                    "Click to edit".
 *
 * Each section carries a search input + a type-filter chip row, and groups
 * its objects into per-type collapsible subsections. Layout-Items rows are
 * dnd-kit drag sources; Data-Layer rows are click-to-edit only.
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

const Library = () => {
  const data = useLibraryData();
  const navigate = useNavigate();
  const scope = useWorkspaceScope();

  // Workspace actions — read from the store directly so the Library has no
  // required props (the parent LeftRail mounts it as `<Library />`).
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const openWorkspaceTabBackground = useStore(s => s.openWorkspaceTabBackground);
  const toggleLeftCollapsed = useStore(s => s.toggleWorkspaceLeftCollapsed);

  // The active workspace tab's id is the selected row's id — both are
  // `${type}:${name}`. Surfacing it here drives LibraryRow's mulberry-bar +
  // tinted-bg selected state through the section → subsection → row chain.
  const selectedRowId = useStore(s => s.workspaceActiveTabId);

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
      // VIS-811 / O-2: the open actions are live; the rest (wrapInChart,
      // showLineage, delete) stay telemetry-only until their tracks wire them.
      const type = routeType(obj);
      if (action === 'edit' && openWorkspaceTab) {
        openWorkspaceTab({ id: `${type}:${obj.name}`, type, name: obj.name });
      } else if (action === 'openInNewTab' && openWorkspaceTabBackground) {
        openWorkspaceTabBackground({
          id: `${type}:${obj.name}`,
          type,
          name: obj.name,
        });
      }
    },
    [openWorkspaceTab, openWorkspaceTabBackground]
  );

  const handleCreate = useCallback(
    (typeKey, source = 'library') => {
      emitWorkspaceEvent('inline_create_used', { source, kind: typeKey });
      // J-2 (VIS-778): "+ New Chart" inside a scoped dashboard opens the
      // Explorer round-trip overlay (build the insight there, it gets wrapped
      // in a chart and placed back on the dashboard). Outside a dashboard
      // scope there's no slot to return to, so draft an empty chart instead.
      if (typeKey === 'chart' && scope.dashboardName) {
        navigate(
          `/workspace/dashboard/${encodeURIComponent(
            scope.dashboardName
          )}/explorer?return_to=workspace&dashboard=${encodeURIComponent(
            scope.dashboardName
          )}&slot=new`
        );
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
    [createWorkspaceObject, openWorkspaceTab, navigate, scope.dashboardName]
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

      <div className="flex flex-1 flex-col overflow-y-auto">
        <LibrarySection
          sectionKey="layout"
          title="Layout Items"
          subtitle="Drag onto the canvas"
          types={LAYOUT_TYPES}
          rowsByType={data.layoutItems}
          selectedRowId={selectedRowId}
          onRowClick={handleRowClick}
          onContextAction={handleContextAction}
        />
        <LibrarySection
          sectionKey="data"
          title="Data Layer"
          subtitle="Click to edit"
          types={DATA_TYPES}
          rowsByType={data.dataLayer}
          selectedRowId={selectedRowId}
          onRowClick={handleRowClick}
          onContextAction={handleContextAction}
        />
      </div>

      <div className="shrink-0 border-t border-gray-200 px-3 py-2 text-[11px] text-gray-400">
        Drag a layout item onto the canvas. Click a data object to edit it.
      </div>
    </aside>
  );
};

export default Library;
