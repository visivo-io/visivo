import React from 'react';
import TopBar from './TopBar';
import TabStrip from './TabStrip';
import LeftRail from './LeftRail';
import RightRail from './RightRail';
import MiddlePane from './MiddlePane';
import DragHandle from './DragHandle';
import useStore from '../../../stores/store';

/**
 * WorkspaceShell — VIS-775 (Track B B2).
 *
 * Pure layout container. Every child component is store-driven — no props
 * are threaded through the shell. The shell itself reads only the
 * layout-relevant state (collapsed flags + widths) so its outer width divs
 * resize correctly.
 *
 * Layout (matches the delivered B-1 design's bands + columns):
 *
 *   ┌──────────── TopBar (h-12 navy, full width) ────────────┐
 *   ├────────────┬──────────────────────────────────────────┤
 *   │            │ TabStrip (h-9 white, scoped to active obj)│
 *   │ LeftRail   ├──────────────────────────┬───────────────┤
 *   │ (full-h)   │ MiddlePane               │ RightRail     │
 *   │            │ (sub-bar + variant body) │ (Outline/Edit)│
 *   │            │                          │               │
 *   └────────────┴──────────────────────────┴───────────────┘
 *
 * Key insight: the **left rail anchors full-height** (from the TopBar to
 * the bottom). The **tab strip's width matches what it scopes** — middle +
 * right rail only, NOT the Library — making it visually obvious that tabs
 * control the editor surface, not the project navigator.
 */
const WorkspaceShell = ({ testId = 'workspace-shell' }) => {
  // Layout state — for the shell's own width divs only. Children read their
  // own state directly from the store.
  const leftCollapsed = useStore(s => s.workspaceLeftCollapsed);
  const rightCollapsed = useStore(s => s.workspaceRightCollapsed);
  const leftWidth = useStore(s => s.workspaceLeftWidth);
  const rightWidth = useStore(s => s.workspaceRightWidth);

  return (
    <div
      data-testid={testId}
      className="flex h-full w-full flex-col overflow-hidden bg-white antialiased"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {/* Left rail — project-wide, full-height anchor. */}
        <div
          style={{ width: leftCollapsed ? 48 : leftWidth }}
          className="shrink-0"
          data-testid="workspace-left-rail-container"
        >
          <LeftRail />
        </div>
        <DragHandle side="left" />
        {/* Tab + middle/right column. The tab strip's width matches exactly
            what the tabs scope (the active-object area). */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TabStrip />
          <div className="flex min-h-0 flex-1">
            <main
              className="flex min-w-0 flex-1 flex-col"
              data-testid="workspace-middle-container"
            >
              <MiddlePane />
            </main>
            <DragHandle side="right" />
            <div
              style={{ width: rightCollapsed ? 48 : rightWidth }}
              className="shrink-0"
              data-testid="workspace-right-rail-container"
            >
              <RightRail />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceShell;
