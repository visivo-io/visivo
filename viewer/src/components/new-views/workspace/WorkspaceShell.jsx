import React from 'react';
import TopBar from './TopBar';
import TabStrip from './TabStrip';
import LeftRail from './LeftRail';
import RightRail from './RightRail';
import MiddlePane from './MiddlePane';
import DragHandle from './DragHandle';

/**
 * WorkspaceShell — VIS-775 (Track B B2).
 *
 * Pure presentational shell — all state arrives as props. The smart
 * `<Workspace>` container reads from the workspace store and URL, wires
 * actions, and passes them down. Splitting smart/dumb makes the shell
 * trivially renderable in Storybook / tests without spinning up the store.
 *
 * Layout (matches the delivered B-1 design's bands + columns):
 *
 *   ┌──────────── TopBar (h-12 navy, full width) ────────────┐
 *   ├────────────┬──────────────────────────────────────────┤
 *   │            │ TabStrip (h-9 white, scoped to active obj)│
 *   │ LeftRail   ├──────────────────────────┬───────────────┤
 *   │ (full-h)   │ MiddlePane               │ RightRail     │
 *   │            │ (sub-bar + variant body) │ (Outline/Edit/│
 *   │            │                          │  History)     │
 *   └────────────┴──────────────────────────┴───────────────┘
 *
 * Key insight: the **left rail anchors full-height** (from the TopBar to
 * the bottom). The **tab strip's width matches what it scopes** — middle +
 * right rail only, NOT the Library — making it visually obvious that tabs
 * control the editor surface, not the project navigator.
 */
const WorkspaceShell = ({
  // Top bar -----------------------------------------------------------------
  projectName,
  canBuild = true,
  dirty = 0,
  onPublishClick,
  onDeployClick,

  // Tabs --------------------------------------------------------------------
  tabs = [],
  activeTabId = null,
  onSelectTab,
  onCloseTab,
  onNewTab,

  // Middle pane -------------------------------------------------------------
  activeObject = null,
  lens = 'preview',
  onLensChange,
  projectId = null,

  // Rails -------------------------------------------------------------------
  leftCollapsed = false,
  rightCollapsed = false,
  onToggleLeftCollapsed,
  onToggleRightCollapsed,
  rightTab = 'edit',
  onSelectRightTab,
  leftWidth = 320,
  rightWidth = 360,
  resizing = null,

  // Slot escape hatch for tests that need to peek at internals -------------
  testId = 'workspace-shell',
}) => {
  return (
    <div
      data-testid={testId}
      className="flex h-full w-full flex-col overflow-hidden bg-white antialiased"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <TopBar
        projectName={projectName}
        canBuild={canBuild}
        dirty={dirty}
        onPublishClick={onPublishClick}
        onDeployClick={onDeployClick}
      />
      <div className="flex min-h-0 flex-1">
        {/* Left rail — project-wide, full-height anchor. */}
        <div
          style={{ width: leftCollapsed ? 48 : leftWidth }}
          className="shrink-0"
          data-testid="workspace-left-rail-container"
        >
          <LeftRail
            collapsed={leftCollapsed}
            onToggleCollapsed={onToggleLeftCollapsed}
          />
        </div>
        <DragHandle
          side="left"
          active={resizing === 'left'}
          widthLabel={resizing === 'left' ? `${leftWidth}px` : null}
        />
        {/* Tab + middle/right column. The tab strip's width matches exactly
            what the tabs scope (the active-object area). */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TabStrip
            tabs={tabs}
            activeId={activeTabId}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onNewTab={onNewTab}
          />
          <div className="flex min-h-0 flex-1">
            <main
              className="flex min-w-0 flex-1 flex-col"
              data-testid="workspace-middle-container"
            >
              <MiddlePane
                activeObject={activeObject}
                lens={lens}
                onLensChange={onLensChange}
                projectId={projectId}
              />
            </main>
            <DragHandle
              side="right"
              active={resizing === 'right'}
              widthLabel={resizing === 'right' ? `${rightWidth}px` : null}
            />
            <div
              style={{ width: rightCollapsed ? 48 : rightWidth }}
              className="shrink-0"
              data-testid="workspace-right-rail-container"
            >
              <RightRail
                collapsed={rightCollapsed}
                onToggleCollapsed={onToggleRightCollapsed}
                activeTab={rightTab}
                onSelectTab={onSelectRightTab}
                activeObject={activeObject}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceShell;
