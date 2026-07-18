import React, { useRef } from 'react';
import LeftPanel from '../../explorer/ExplorerLeftPanel';
import CenterPanel from '../../explorer/CenterPanel';
import ExplorerRightPanel from '../../explorer/ExplorerRightPanel';
import ExplorerDndContext from '../../explorer/ExplorerDndContext';
import VerticalDivider from '../../common/VerticalDivider';
import useStore from '../../../stores/store';
import { usePanelResize } from '../../../hooks/usePanelResize';
import useExplorerWorkbenchInit from '../../explorer/useExplorerWorkbenchInit';

/**
 * ExplorationWorkbench — the legacy Explorer 3-panel bundle
 * (ExplorerLeftPanel + CenterPanel + ExplorerRightPanel under
 * ExplorerDndContext), sized to fill an `ExplorationPane` inside the
 * Workspace shell rather than the standalone `/explorer` route's full
 * viewport (Explore 2.0 Phase 2 — 03-delivery-plan.md's composition-scoping
 * note: "nests the entire legacy 3-panel bundle + its DndContext inside
 * ExplorationPane as a temporary internal implementation detail").
 *
 * Deliberately the SAME composition + init lifecycle as `ExplorerPage`
 * (the standalone route), just re-parented and re-sized:
 *   - `useExplorerWorkbenchInit()` is the extracted, SHARED init hook (diff
 *     debounce, auto-create-model-tab, auto-create-insight, fetch-defaults) —
 *     see its docstring for why a second copy would be a forbidden fork.
 *   - No return-bar / `?return_to=` handling here — that's the dashboard
 *     round-trip intent, out of Phase 2's scope (lands with Phase 5's
 *     `return_to` placement-intent work, 02-architecture.md §5).
 *   - Nested `ExplorerDndContext` under the outer `WorkspaceDndContext` is
 *     accepted ONLY because the outer context has no drop targets inside this
 *     pane yet (dnd-kit contexts don't compose) — DnD unifies in Phase 3a.
 *
 * The HOST (`ExplorationPane`) is responsible for gating this component's
 * mount on the per-exploration state restore having already landed — see
 * `useExplorerWorkbenchInit`'s docstring.
 */
const ExplorationWorkbench = () => {
  const leftNavCollapsed = useStore(s => s.explorerLeftNavCollapsed);

  useExplorerWorkbenchInit();

  const containerRef = useRef(null);
  const {
    ratio: leftRatio,
    isResizing: isLeftResizing,
    handleMouseDown: handleLeftMouseDown,
  } = usePanelResize({
    containerRef,
    direction: 'horizontal',
    initialRatio: 0.18,
    minSize: 48,
    maxRatio: 0.3,
    minRatio: 0.03,
  });

  const leftWidth = leftNavCollapsed ? 48 : Math.round(leftRatio * 100);

  return (
    <ExplorerDndContext>
      <div
        className="flex min-h-0 flex-1 overflow-hidden bg-gray-50"
        data-testid="exploration-workbench"
        ref={containerRef}
      >
        <div
          style={{ width: leftNavCollapsed ? '48px' : `${leftWidth}%` }}
          className="flex-shrink-0 overflow-hidden"
        >
          <LeftPanel />
        </div>
        {!leftNavCollapsed && (
          <VerticalDivider isDragging={isLeftResizing} handleMouseDown={handleLeftMouseDown} />
        )}
        <CenterPanel />
        <ExplorerRightPanel />
      </div>
    </ExplorerDndContext>
  );
};

export default ExplorationWorkbench;
