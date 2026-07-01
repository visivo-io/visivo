import React from 'react';
import TabStrip from './TabStrip';
import LeftRail from './LeftRail';
import RightRail from './RightRail';
import MiddlePane from './MiddlePane';
import DragHandle from './DragHandle';
import WorkspaceDndContext from './WorkspaceDndContext';
import ExternalEditBanner from './ExternalEditBanner';
import useWorkspaceTabShortcuts from './useWorkspaceTabShortcuts';
import useStore from '../../../stores/store';

/**
 * WorkspaceShell — VIS-775 (Track B B2).
 *
 * Pure layout container. Every child component is store-driven — no props
 * are threaded through the shell. The shell itself reads only the
 * layout-relevant state (collapsed flags + widths) so its outer width divs
 * resize correctly.
 *
 * Layout — the shell fills the area below Home's shared sticky `<TopNav>`
 * (commit / deploy / tools live up there, not in the shell):
 *
 *   ┌────────────┬──────────────────────────────────────────┐
 *   │            │ TabStrip (h-9 white, scoped to active obj)│
 *   │ LeftRail   ├──────────────────────────┬───────────────┤
 *   │ (full-h)   │ MiddlePane               │ RightRail     │
 *   │            │ (sub-bar + variant body) │ (Outline/Edit)│
 *   │            │                          │               │
 *   └────────────┴──────────────────────────┴───────────────┘
 *
 * Key insight: the **left rail anchors full-height**. The **tab strip's
 * width matches what it scopes** — middle + right rail only, NOT the
 * Library — making it visually obvious that tabs control the editor
 * surface, not the project navigator.
 */
const WorkspaceShell = ({ testId = 'workspace-shell' }) => {
  // Layout state — for the shell's own width divs only. Children read their
  // own state directly from the store.
  const leftCollapsed = useStore(s => s.workspaceLeftCollapsed);
  const rightCollapsed = useStore(s => s.workspaceRightCollapsed);
  const leftWidth = useStore(s => s.workspaceLeftWidth);
  const rightWidth = useStore(s => s.workspaceRightWidth);

  // Tab keyboard shortcuts (VIS-812 / O-3): Cmd/Ctrl+T new tab, Cmd/Ctrl+W
  // close active (through the dirty guard), Cmd/Ctrl+1..9 switch by position.
  useWorkspaceTabShortcuts();

  return (
    <div
      data-testid={testId}
      className="flex h-full w-full flex-col overflow-hidden bg-white antialiased"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Single shared dnd-kit context (VIS-802 / G-1) — spans the Library
          (drag source, left rail) AND the right-rail RefDropZones so a Library
          row dragged onto a form field reaches its drop target. It SUBSUMES
          ProjectEditor's former context (which is why the middle pane is inside
          it too); see WorkspaceDndContext for the routing decision. */}
      <WorkspaceDndContext>
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
                {/* H-2: external-edit warning — top of the canvas area,
                    full-width within the middle pane, non-blocking. */}
                <ExternalEditBanner />
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
      </WorkspaceDndContext>
      {/* Commit / Deploy live in Home's shared <TopNav>; the commit confirm
          (and Discard) flow is Home's layout-level <CommitModal>. The shell
          mounts neither a top bar nor a second modal. */}
    </div>
  );
};

export default WorkspaceShell;
