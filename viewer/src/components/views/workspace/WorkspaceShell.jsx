import React, { useEffect, useRef } from 'react';
import TabStrip from './TabStrip';
import LeftRail from './LeftRail';
import RightRail from './RightRail';
import MiddlePane from './MiddlePane';
import DragHandle from './DragHandle';
import WorkspaceDndContext from './WorkspaceDndContext';
import ExternalEditBanner from './ExternalEditBanner';
import WorkspaceToast from './WorkspaceToast';
import useWorkspaceTabShortcuts from './useWorkspaceTabShortcuts';
import useStore from '../../../stores/store';

// 6c-T2 responsive shell (audit shell-ia #8/#10, cold-start #2 — BLOCKER at
// 1100px). The canvas (SQL editor / results / preview / dashboard canvas)
// gets a REAL minimum width; when the shell's own measured width can't fit
// both rails at their configured widths AND that minimum, rails collapse to
// make room — library (left) first, right rail second. Exported for unit
// tests; `WorkspaceShell` is the only runtime caller.
export const RAIL_COLLAPSED_WIDTH = 48;
export const CENTER_MIN_WIDTH = 480;

/**
 * computeAutoCollapse — stateless: given the shell's measured width and the
 * two rails' CONFIGURED (expanded) widths, returns the minimal collapse
 * needed to keep the canvas at `CENTER_MIN_WIDTH`, independent of who
 * collapsed what. `WorkspaceShell` feeds this into
 * `applyWorkspaceAutoCollapse`, which reconciles the target against actual
 * state (never fighting a rail the user manually opened/closed — see that
 * action's docstring in `workspaceStore.js`).
 */
export const computeAutoCollapse = ({ containerWidth, leftWidth, rightWidth }) => {
  if (!containerWidth) return { left: false, right: false };

  const bothExpanded = containerWidth - leftWidth - rightWidth;
  if (bothExpanded >= CENTER_MIN_WIDTH) return { left: false, right: false };

  const leftCollapsedOnly = containerWidth - RAIL_COLLAPSED_WIDTH - rightWidth;
  if (leftCollapsedOnly >= CENTER_MIN_WIDTH) return { left: true, right: false };

  return { left: true, right: true };
};

/**
 * WorkspaceShell — VIS-775 (Track B B2); responsive shell added 6c-T2.
 *
 * Pure layout container. Every child component is store-driven — no props
 * are threaded through the shell. The shell itself reads only the
 * layout-relevant state (collapsed flags + widths) so its outer width divs
 * resize correctly, and measures its OWN width to drive narrow-viewport
 * auto-collapse (`computeAutoCollapse` / `applyWorkspaceAutoCollapse`).
 *
 * Layout — the shell fills the area below Home's shared sticky `<TopNav>`
 * (commit / deploy / tools live up there, not in the shell):
 *
 *   ┌────────────┬──────────────────────────────────────────┐
 *   │            │ TabStrip (h-9 white, scoped to active obj)│
 *   │ LeftRail   ├──────────────────────────┬───────────────┤
 *   │ (full-h)   │ MiddlePane               │ RightRail     │
 *   │            │ (sub-bar + variant body) │ (Outline/Edit/│
 *   │            │ min-width: 480px         │  Build)       │
 *   └────────────┴──────────────────────────┴───────────────┘
 *
 * Key insight: the **left rail anchors full-height**. The **tab strip's
 * width matches what it scopes** — middle + right rail only, NOT the
 * Library — making it visually obvious that tabs control the editor
 * surface, not the project navigator. The **center pane never drops below
 * `CENTER_MIN_WIDTH`** — at narrow desktop widths (a normal laptop with a
 * sidebar open, ~1100px) the rails collapse to protect it instead.
 */
const WorkspaceShell = ({ testId = 'workspace-shell' }) => {
  // Layout state — for the shell's own width divs only. Children read their
  // own state directly from the store.
  const leftCollapsed = useStore(s => s.workspaceLeftCollapsed);
  const rightCollapsed = useStore(s => s.workspaceRightCollapsed);
  const leftWidth = useStore(s => s.workspaceLeftWidth);
  const rightWidth = useStore(s => s.workspaceRightWidth);
  const applyWorkspaceAutoCollapse = useStore(s => s.applyWorkspaceAutoCollapse);

  // Tab keyboard shortcuts (VIS-812 / O-3): Cmd/Ctrl+T new tab, Cmd/Ctrl+W
  // close active (through the dirty guard), Cmd/Ctrl+1..9 switch by position.
  useWorkspaceTabShortcuts();

  // 6c-T2 — measure the shell's own content width (not `window.innerWidth`:
  // the shell only fills the area below TopNav) and re-derive the auto-
  // collapse target on every resize, plus whenever a configured rail width
  // changes (dragging a handle wider can itself push the canvas under the
  // minimum). `leftCollapsed`/`rightCollapsed` are read here only so a
  // manual toggle re-evaluates immediately (e.g. the user re-expands a rail
  // at a width that still doesn't fit both — the target then reports it
  // should collapse again on the very next measurement rather than waiting
  // for an actual resize event).
  const shellRef = useRef(null);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = width => {
      const { left, right } = computeAutoCollapse({
        containerWidth: width,
        leftWidth,
        rightWidth,
      });
      applyWorkspaceAutoCollapse({ left, right });
    };
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    // No separate `getBoundingClientRect()` fallback call — `observe()`
    // itself fires an initial callback with the current size (same
    // reliance CenterPanel's own width `ResizeObserver` already has), and a
    // second explicit call here would race it with an unmeasured (zero)
    // width in test environments without real layout.
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftWidth, rightWidth, leftCollapsed, rightCollapsed, applyWorkspaceAutoCollapse]);

  return (
    <div
      ref={shellRef}
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
            style={{ width: leftCollapsed ? RAIL_COLLAPSED_WIDTH : leftWidth }}
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
                className="flex flex-1 flex-col"
                style={{ minWidth: CENTER_MIN_WIDTH }}
                data-testid="workspace-middle-container"
              >
                {/* H-2: external-edit warning — top of the canvas area,
                    full-width within the middle pane, non-blocking. */}
                <ExternalEditBanner />
                <MiddlePane />
              </main>
              <DragHandle side="right" />
              <div
                style={{ width: rightCollapsed ? RAIL_COLLAPSED_WIDTH : rightWidth }}
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
      <WorkspaceToast />
    </div>
  );
};

export default WorkspaceShell;
