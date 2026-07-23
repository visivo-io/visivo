import React from 'react';
import CenterPanel from '../../explorer/CenterPanel';
import useExplorerWorkbenchInit from '../../explorer/useExplorerWorkbenchInit';
import ExplorationQueryChips from './ExplorationQueryChips';

/**
 * ExplorationWorkbench — the exploration CENTER pane (SQL editor / results /
 * chart preview), sized to fill an `ExplorationPane` inside the Workspace
 * shell rather than a standalone full-viewport route (Explore 2.0 Phase 2
 * origin; the Phase 3a DnD unification + Phase 3b Build-rail rebuild both
 * landed here since). As of 6c-T2 (D6 — the two-rails fix) this is CenterPanel
 * ALONE: the Insight+Chart CRUD (`ExplorationBuildRail`) moved OUT to the
 * shell's single `<RightRail>` (exploration scope's `Build` tab,
 * `RightRail.jsx`), which threads `explorationId` from its own
 * `selectedItem` rather than a prop passed down through here — mounting a
 * second copy in-pane, alongside the shell's already-mounted rail, was
 * exactly the two-rails bug (shell-ia #1, code-grounding defect #1).
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
 *   - `useExplorerWorkbenchInit()` (the shared init hook) is unchanged.
 *     `RightRail` mounts `ExplorationBuildRail` independently of this pane,
 *     reading the SAME shared `explorerStore` singleton `ExplorationPane`
 *     restores in a `useLayoutEffect` (synchronous, pre-paint) on activation
 *     — so a tab switch can't leave a stale frame visible, but the rail is
 *     not itself gated on that restore the way this pane gates ITS OWN mount
 *     (see `ExplorationPane`'s docstring). It never triggers the "auto-create
 *     when empty" this hook owns, so there's nothing here for an early read
 *     to corrupt — worst case is a same-commit stale render, not a decision
 *     with a side effect.
 *   - No `?return_to=` QUERY-PARAM handling here — that dead param form was
 *     replaced at the Phase 3b cutover's redirect route (02-architecture.md
 *     §5). The `return_to` RECORD FIELD itself is consumed inside
 *     `ExplorationPromoteModal`'s success state (VIS-1068's "Place in
 *     <dashboard>" offer), opened from the Build rail in `RightRail` now,
 *     not from here.
 *
 * The HOST (`ExplorationPane`) is responsible for gating this component's
 * mount on the per-exploration state restore having already landed — see
 * `useExplorerWorkbenchInit`'s docstring.
 */
const ExplorationWorkbench = () => {
  useExplorerWorkbenchInit();

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden bg-gray-50"
      data-testid="exploration-workbench"
    >
      <CenterPanel modelTabBar={<ExplorationQueryChips />} enableLibraryDrop />
    </div>
  );
};

export default ExplorationWorkbench;
