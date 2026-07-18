import React from 'react';
import CenterPanel from '../../explorer/CenterPanel';
import ExplorationBuildRail from './ExplorationBuildRail';
import useExplorerWorkbenchInit from '../../explorer/useExplorerWorkbenchInit';
import ExplorationQueryChips from './ExplorationQueryChips';

/**
 * ExplorationWorkbench — CenterPanel + ExplorationBuildRail, sized to fill an
 * `ExplorationPane` inside the Workspace shell rather than a standalone
 * full-viewport route (Explore 2.0 Phase 2 origin; the Phase 3a DnD
 * unification + Phase 3b Build-rail rebuild both landed here since).
 *
 * Current composition (post Phase 3b cutover, 03-delivery-plan.md):
 *
 *   - The Library (the shell's persistent left rail) is the ONE browse
 *     surface — its source → schema → table → column drill-down
 *     (`LibrarySourceRow.jsx`) + model/metric/dimension/insight/input rows
 *     (`LibraryRow.jsx`'s `EXPLORATION_DRAG_TYPES`) are the only way to pull
 *     an object or column into the surface. The standalone `/explorer`
 *     route + its own `ExplorerLeftPanel`/`SourceBrowser`/`ExplorerDndContext`
 *     bundle are DELETED — `/explorer` is now a permanent redirect here.
 *   - `CenterPanel` gets two opt-in props (both default OFF elsewhere — no
 *     other consumer remains, but the props stay optional so a future
 *     CenterPanel caller isn't forced into this surface's behavior):
 *     `modelTabBar` (`<ExplorationQueryChips/>`, compact query-chip switcher
 *     replacing the retired horizontal `ModelTabBar`) and `enableLibraryDrop`
 *     (SQL editor as a Library table/column drop target, D9).
 *   - This pane mounts INSIDE the shell's single `WorkspaceDndContext`
 *     (`WorkspaceShell.jsx`); `routeExplorationDragEnd` carries the ported
 *     SQL-editor/interaction/chart-insight-zone resolution logic, and the
 *     NEW `property-zone` branch (S5/D10) hands insight-prop-slot drops
 *     straight to each `PropertyRow`'s own `onDropField` — no nested DnD
 *     context, no global "active insight" indirection.
 *   - `ExplorationBuildRail` (Phase 3b, VIS-1059) replaces the retired
 *     `ExplorerRightPanel`: Chart + stacked Insight sections rebuilt onto
 *     `TracePropsEditor`/`FieldGroupList` (typed D8/D10 pills, advisory
 *     ref-target validation), a promoted-trail placeholder, and the
 *     UNCHANGED `ExplorerSaveModal`/"Save to Project" flow (kept until
 *     Phase 4's promote-gate rebuild).
 *   - `useExplorerWorkbenchInit()` (the shared init hook) is unchanged.
 *   - No return-bar / `?return_to=` handling here — that's the dashboard
 *     round-trip intent, consumed at the Phase 3b cutover's redirect route,
 *     not this pane (02-architecture.md §5).
 *
 * The HOST (`ExplorationPane`) is responsible for gating this component's
 * mount on the per-exploration state restore having already landed — see
 * `useExplorerWorkbenchInit`'s docstring — and passes down the exploration's
 * own `id` (purely for the Build rail's promoted-trail placeholder).
 *
 * @param {object} props
 * @param {string} [props.id] - the current exploration's backend id.
 */
const ExplorationWorkbench = ({ id }) => {
  useExplorerWorkbenchInit();

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden bg-gray-50"
      data-testid="exploration-workbench"
    >
      <CenterPanel modelTabBar={<ExplorationQueryChips />} enableLibraryDrop />
      <ExplorationBuildRail explorationId={id} />
    </div>
  );
};

export default ExplorationWorkbench;
