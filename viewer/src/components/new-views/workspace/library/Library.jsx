import React, { useCallback } from 'react';
import { PiSidebar } from 'react-icons/pi';
import LibrarySection from './LibrarySection';
import useLibraryData from './useLibraryData';
import { LAYOUT_TYPES, DATA_TYPES } from './LibraryRow';
import useStore from '../../../../stores/store';
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
 * "+ New X" CTAs (droppable subsections only) delegate to each store's
 * per-type `openCreate*Modal()` action. The `inline_create_used` telemetry
 * event fires only from this rail per the C3 scope.
 *
 * The drag-preview pill itself is rendered by the workspace `<DragOverlay>`
 * via `<LibraryDragPreview>` — see Track D for the `<DndContext>` wiring.
 */
const Library = () => {
  const data = useLibraryData();

  // Workspace actions — read from the store directly so the Library has no
  // required props (the parent LeftRail mounts it as `<Library />`).
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const toggleLeftCollapsed = useStore(s => s.toggleWorkspaceLeftCollapsed);

  // The active workspace tab's id is the selected row's id — both are
  // `${type}:${name}`. Surfacing it here drives LibraryRow's mulberry-bar +
  // tinted-bg selected state through the section → subsection → row chain.
  const selectedRowId = useStore(s => s.workspaceActiveTabId);

  // Create-modal openers (per-type). Each store registers its own opener;
  // we wire the four droppable Layout types here since only those expose a
  // "+ New X" button in the rail.
  const openCreateChartModal = useStore(s => s.openCreateChartModal);
  const openCreateTableModal = useStore(s => s.openCreateTableModal);
  const openCreateMarkdownModal = useStore(s => s.openCreateMarkdownModal);
  const openCreateInputModal = useStore(s => s.openCreateInputModal);

  const handleRowClick = useCallback(
    obj => {
      if (openWorkspaceTab) {
        openWorkspaceTab({
          id: `${obj.type}:${obj.name}`,
          type: obj.type,
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

  const handleContextAction = useCallback((action, obj) => {
    // Track G wires the actual handlers; for C3 we just emit telemetry.
    emitWorkspaceEvent('library_row_context_action', {
      type: obj.type,
      name: obj.name,
      action,
    });
  }, []);

  const handleCreate = useCallback(
    typeKey => {
      emitWorkspaceEvent('inline_create_used', { source: 'library', kind: typeKey });
      switch (typeKey) {
        case 'chart':
          if (openCreateChartModal) openCreateChartModal();
          break;
        case 'table':
          if (openCreateTableModal) openCreateTableModal();
          break;
        case 'markdown':
          if (openCreateMarkdownModal) openCreateMarkdownModal();
          break;
        case 'input':
          if (openCreateInputModal) openCreateInputModal();
          break;
        default:
          break;
      }
    },
    [openCreateChartModal, openCreateTableModal, openCreateMarkdownModal, openCreateInputModal]
  );

  return (
    <aside
      data-testid="workspace-left-rail"
      data-collapsed="false"
      className="relative flex h-full flex-col overflow-hidden border-r border-gray-200 bg-white text-gray-800"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 px-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-gray-900">Library</span>
          <span className="text-[11px] text-gray-400">· project</span>
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
          onCreate={handleCreate}
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
