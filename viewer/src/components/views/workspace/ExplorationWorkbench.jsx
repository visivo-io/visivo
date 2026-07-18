import React from 'react';
import CenterPanel from '../../explorer/CenterPanel';
import ExplorerRightPanel from '../../explorer/ExplorerRightPanel';
import useExplorerWorkbenchInit from '../../explorer/useExplorerWorkbenchInit';
import ExplorationQueryChips from './ExplorationQueryChips';

/**
 * ExplorationWorkbench — the legacy Explorer bundle (now CenterPanel +
 * ExplorerRightPanel), sized to fill an `ExplorationPane` inside the
 * Workspace shell rather than the standalone `/explorer` route's full
 * viewport (Explore 2.0 Phase 2 origin; SURGICALLY REDUCED in Phase 3a per
 * 03-delivery-plan.md's Phase 3a scope: "Delete ExplorerLeftPanel... delete
 * ExplorerDndContext").
 *
 * What changed in Phase 3a (D9 / DnD unification), and — just as
 * importantly — what did NOT:
 *
 *   - `ExplorerLeftPanel` (+ its nested `SourceBrowser`) is REMOVED from
 *     this composition. The Workspace's own Library (the shell's persistent
 *     left rail, one level up from this component) is now the ONE browse
 *     surface for the exploration surface too — its new source → schema →
 *     table → column drill-down (`LibrarySourceRow.jsx`) replaces
 *     `SourceBrowser`, and its existing model/metric/dimension/insight/input
 *     rows keep their drag semantics (`LibraryRow.jsx`'s
 *     `EXPLORATION_DRAG_TYPES`). Both files stay ALIVE in the tree —
 *     `ExplorerPage.jsx` (the standalone `/explorer` route) still renders
 *     `ExplorerLeftPanel` directly and must keep passing its existing e2e
 *     stories untouched until the Phase 3b cutover deletes that route
 *     entirely (per this task's explicit test-compat directive — the
 *     03-delivery-plan.md phrasing "Delete ExplorerLeftPanel" describes the
 *     Phase 3b END STATE, not a Phase 3a file deletion). Only THIS
 *     component's use of it is removed.
 *   - `ExplorerDndContext` is likewise REMOVED from this nesting — it stays
 *     alive as a component + its own DndContext for `ExplorerPage.jsx`'s
 *     standalone route (same reasoning as above). Deleting it here is what
 *     "DnD unification" means concretely: this pane now mounts INSIDE the
 *     shell's single `WorkspaceDndContext` (`WorkspaceShell.jsx`), whose
 *     router (`routeExplorationDragEnd`) has the SAME resolution logic
 *     `ExplorerDndContext.handleDragEnd` had, ported verbatim — see that
 *     function's docstring. Nested dnd-kit contexts don't compose, so this
 *     was the only way a Library drag (now sourced from the OUTER rail, not
 *     a nested one) could ever reach the exploration surface's drop targets
 *     (SQL editor, insight prop slots, interactions, the chart's insight
 *     zone) in the first place.
 *   - `CenterPanel` gets two new opt-in props (both default OFF, so
 *     `ExplorerPage`'s call site is unaffected): `modelTabBar` (this pane
 *     passes `<ExplorationQueryChips/>`, replacing the horizontal
 *     `ModelTabBar` with compact chips, 01-ux-spec.md §3) and
 *     `enableLibraryDrop` (turns the SQL editor into a Library table/column
 *     drop target, D9).
 *   - `ExplorerRightPanel` is UNCHANGED — its existing droppable prop slots
 *     (`property-zone`/`axis-zone`/`interaction-zone`/`insight-zone`) keep
 *     working exactly as before; rebuilding that rail is explicitly Phase
 *     3b's job (S5), not this phase's.
 *   - `useExplorerWorkbenchInit()` (the shared init hook) is unchanged —
 *     still the SAME hook `ExplorerPage` uses, per its own docstring on why
 *     a second copy would be a forbidden fork.
 *   - No return-bar / `?return_to=` handling here — that's the dashboard
 *     round-trip intent, out of scope until Phase 5's `return_to`
 *     placement-intent work (02-architecture.md §5).
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
      <ExplorerRightPanel />
    </div>
  );
};

export default ExplorationWorkbench;
