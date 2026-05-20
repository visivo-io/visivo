import React, { useCallback } from 'react';
import { PiSidebar } from 'react-icons/pi';
import LibrarySection from './LibrarySection';
import useLibraryData from './useLibraryData';
import { useWorkspaceScope } from '../useWorkspaceScope';
import useStore from '../../../../stores/store';
import { emitWorkspaceEvent } from '../telemetry';

/**
 * Library — VIS-769 / Track C C1.
 *
 * The Library left rail: five sections (Insert · Charts · Insights · Models ·
 * Sources) that replace the legacy `/editor` flat list. Each section has a
 * collapsible header, a debounced search input, scope chips (All · Used here
 * · Compatible), and a list of rows. Charts / Insights are drag-source
 * eligible (handled by Track D's drop targets); Models / Sources are click-to-
 * edit only per the design.
 *
 * The single-PR Library bundles C1 + C2 + C3:
 *   - C1 (VIS-769) — shell + sections + rows.
 *   - C2 (VIS-773) — search + scope chips + persisted collapse.
 *   - C3 (VIS-776) — drag sources + LibraryRowFlipPopover.
 *
 * Selection (which row binds the Edit panel) is wired into the workspace
 * store via `openWorkspaceTab` — clicking a row opens (or focuses) a tab
 * for the object. Track G wires the actual Edit form into the right rail.
 *
 * "+ New X" CTAs delegate to each store's `openCreateModal()` action. The
 * inline_create_used telemetry event fires only from this rail per the C3
 * scope (other entry points are out of scope until VIS-N1 / VIS-G1).
 */
const Library = ({ onCollapse }) => {
  const data = useLibraryData();
  const scope = useWorkspaceScope();

  // Workspace actions — open or focus a tab for the clicked row.
  const openWorkspaceTab = useStore((s) => s.openWorkspaceTab);

  // Create-modal openers (per-type). Each store registers its own opener
  // with a slightly different name; we wire them all here so the Library
  // doesn't need to know the per-store naming convention.
  const openCreateSourceModal = useStore((s) => s.openCreateModal);
  const openCreateModelModal = useStore((s) => s.openCreateModelModal);
  const openCreateChartModal = useStore((s) => s.openCreateChartModal);
  const openCreateInsightModal = useStore((s) => s.openCreateInsightModal);

  const handleRowClick = useCallback(
    (obj) => {
      // Insert primitives don't open a tab — they're drag-only on the
      // canvas; clicking them is a no-op.
      if (obj.type === 'insert') return;

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
    (kind) => {
      emitWorkspaceEvent('inline_create_used', { source: 'library', kind });
      switch (kind) {
        case 'chart':
          if (openCreateChartModal) openCreateChartModal();
          break;
        case 'insight':
          if (openCreateInsightModal) openCreateInsightModal();
          break;
        case 'model':
          if (openCreateModelModal) openCreateModelModal();
          break;
        case 'source':
          if (openCreateSourceModal) openCreateSourceModal();
          break;
        default:
          break;
      }
    },
    [
      openCreateChartModal,
      openCreateInsightModal,
      openCreateModelModal,
      openCreateSourceModal,
    ]
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
          onClick={onCollapse}
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
          sectionKey="insert"
          label="Insert"
          hint="Drag onto the canvas"
          rows={data.insert}
          scope={scope.scope}
          draggable
          showCreate={false}
          showScopeChips={false}
          emptyText="No layout primitives configured"
          onRowClick={handleRowClick}
          onContextAction={handleContextAction}
        />
        <LibrarySection
          sectionKey="charts"
          label="Charts"
          hint="Drag onto the canvas"
          rows={data.charts}
          scope={scope.scope}
          draggable
          showCreate
          createLabel="Chart"
          emptyText="No charts yet"
          onRowClick={handleRowClick}
          onContextAction={handleContextAction}
          onCreate={() => handleCreate('chart')}
        />
        <LibrarySection
          sectionKey="insights"
          label="Insights"
          rows={data.insights}
          scope={scope.scope}
          draggable
          showCreate
          createLabel="Insight"
          emptyText="No insights yet"
          onRowClick={handleRowClick}
          onContextAction={handleContextAction}
          onCreate={() => handleCreate('insight')}
        />
        <LibrarySection
          sectionKey="models"
          label="Models"
          rows={data.models}
          scope={scope.scope}
          draggable={false}
          showCreate
          createLabel="Model"
          emptyText="No models yet"
          onRowClick={handleRowClick}
          onContextAction={handleContextAction}
          onCreate={() => handleCreate('model')}
        />
        <LibrarySection
          sectionKey="sources"
          label="Sources"
          rows={data.sources}
          scope={scope.scope}
          draggable={false}
          showCreate
          createLabel="Source"
          emptyText="No sources yet"
          onRowClick={handleRowClick}
          onContextAction={handleContextAction}
          onCreate={() => handleCreate('source')}
        />
      </div>

      <div className="shrink-0 border-t border-gray-200 px-3 py-2 text-[11px] text-gray-400">
        Drag any item onto the canvas or onto the Edit panel.
      </div>
    </aside>
  );
};

export default Library;
