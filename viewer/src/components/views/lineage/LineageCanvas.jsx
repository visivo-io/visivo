import React, { useCallback, useEffect, useState } from 'react';
import Lineage from './Lineage';
import OpenObjectContextMenu from '../workspace/OpenObjectContextMenu';
import useStore from '../../../stores/store';
import { useWorkspaceScope } from '../workspace/useWorkspaceScope';
import { emitWorkspaceEvent } from '../workspace/telemetry';
import { EXPLORE_THIS_TYPES, EXPLORATION_DRAG_TYPES } from '../workspace/library/LibraryRow';

/**
 * LineageCanvas — VIS-E1 (VIS-779 / Track E).
 *
 * A thin wrapper around the existing `<Lineage>` React Flow DAG. It mounts
 * in the Workspace middle pane when the dashboard lens is set to "lineage"
 * (replacing the Track-E placeholder).
 *
 * Responsibilities:
 *   - Derive the lineage `selector` from `useWorkspaceScope()`:
 *       · `*`              — unscoped (root / project).
 *       · `+<dashboardName>+` — dashboard scope.
 *       · `+<itemName>+`      — item scope (both directions, VIS-1213).
 *   - Own the "show full project" reset. The scope-indicator strip this used
 *     to render was removed (VIS-1213): it repeated the object name already
 *     shown in the selector row directly beneath it. The reset survives as
 *     `onResetScope`, which <Lineage> renders inside that row — still
 *     widening the scope back to `*` WITHOUT changing the route.
 *   - Round-trip selection: clicking a node updates the workspace selection
 *     via `openWorkspaceTab` (and the scope, in turn, re-derives the selector).
 *   - Fire the `middle_pane_toggled` telemetry event on lineage entry.
 *
 * The DAG itself, the manual selector input, zoom controls, and mini-map are
 * UNCHANGED — they ship exactly as today (the manual input still overrides the
 * scope-derived selector until the scope changes again).
 */
const LineageCanvas = () => {
  const { scope, selector, dashboardName } = useWorkspaceScope();
  const openWorkspaceTab = useStore((s) => s.openWorkspaceTab);
  const openWorkspaceTabBackground = useStore((s) => s.openWorkspaceTabBackground);
  const setWorkspaceLensIntent = useStore((s) => s.setWorkspaceLensIntent);
  const createExploration = useStore((s) => s.createExploration);
  const buildExplorationSeedState = useStore((s) => s.buildExplorationSeedState);
  const addObjectToActiveExploration = useStore((s) => s.addObjectToActiveExploration);
  // VIS-1067: only offer "Add to exploration" while an exploration tab is
  // the ACTIVE one — see Library.jsx's identical gate for why.
  const canAddToExploration = useStore((s) => s.workspaceActiveObject?.type === 'exploration');

  // Local "show full project" override. When active we force `*` regardless of
  // the derived scope — without touching the route. It auto-clears whenever the
  // underlying scope changes (the user navigated/selected something new), so a
  // fresh scope always re-narrows the DAG.
  const [showFullProject, setShowFullProject] = useState(false);
  useEffect(() => {
    setShowFullProject(false);
  }, [scope, selector]);

  // Fire `middle_pane_toggled` on lineage entry (and whenever the scope it is
  // showing changes), tagging the active scope so analytics can see which
  // surface the user landed the lineage lens on.
  useEffect(() => {
    emitWorkspaceEvent('middle_pane_toggled', {
      pane: 'lineage',
      scope,
      dashboardName: dashboardName || null,
      selector,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveSelector = showFullProject ? '*' : selector;

  const handleResetScope = useCallback(() => {
    setShowFullProject(true);
    emitWorkspaceEvent('middle_pane_toggled', {
      pane: 'lineage',
      scope: 'root',
      reason: 'show_full_project',
    });
  }, []);

  // Round-trip a node click into the workspace selection. `openWorkspaceTab`
  // updates `workspaceActiveObject` + `workspaceActiveTabId`, which the
  // scope hook reads back — so clicking a node re-scopes the lineage view.
  const handleNodeSelect = useCallback(
    (obj) => {
      if (!obj || !obj.type || !obj.name) return;
      // The user is walking the DAG — ask the new object's pane to open on
      // the Lineage lens (one-shot, object-scoped; the pane clears it).
      // Without this, selecting a node with a Track-N preview would bounce
      // the middle pane to Preview mid-walk (VIS-779 Step 4). Dashboards are
      // excluded: DashboardPane follows the store lens, which is already
      // 'lineage' here, and PerObjectPane (the intent's only consumer) never
      // renders dashboards — the intent would just linger unconsumed.
      if (setWorkspaceLensIntent && obj.type !== 'dashboard') {
        setWorkspaceLensIntent({ objectKey: `${obj.type}:${obj.name}`, lens: 'lineage' });
      }
      if (openWorkspaceTab) {
        openWorkspaceTab({ id: `${obj.type}:${obj.name}`, type: obj.type, name: obj.name });
      }
      emitWorkspaceEvent('lineage_node_selected', { type: obj.type, name: obj.name });
    },
    [openWorkspaceTab, setWorkspaceLensIntent]
  );

  // Right-click a node → "Open / Open in new tab" (VIS-811 / Track O O-2).
  // `ctxMenu`: null | { x, y, obj: { type, name } } — viewport coordinates for
  // the portal-rendered shared menu.
  const [ctxMenu, setCtxMenu] = useState(null);
  const handleNodeContextMenu = useCallback((event, obj) => {
    if (!obj || !obj.type || !obj.name) return;
    setCtxMenu({ x: event.clientX, y: event.clientY, obj });
  }, []);
  const dismissCtxMenu = useCallback(() => setCtxMenu(null), []);
  const handleCtxOpen = useCallback(
    (obj) => handleNodeSelect(obj),
    [handleNodeSelect]
  );
  const handleCtxOpenInNewTab = useCallback(
    (obj) => {
      if (openWorkspaceTabBackground) {
        openWorkspaceTabBackground({
          id: `${obj.type}:${obj.name}`,
          type: obj.type,
          name: obj.name,
        });
      }
      emitWorkspaceEvent('lineage_node_context_action', {
        type: obj.type,
        name: obj.name,
        action: 'openInNewTab',
      });
    },
    [openWorkspaceTabBackground]
  );

  // VIS-1067 — "Explore this" mints a new exploration seeded from the
  // clicked DAG node (pre-wired per `buildExplorationSeedState`) and opens
  // its tab; "Add to exploration" adds it into the currently active one.
  const handleCtxExploreThis = useCallback(
    (obj) => {
      if (!createExploration || !openWorkspaceTab) return;
      const seed = { type: obj.type, name: obj.name };
      const legacyStateOverride = buildExplorationSeedState
        ? buildExplorationSeedState(seed)
        : null;
      createExploration(seed, null, legacyStateOverride).then((result) => {
        if (result?.success) {
          openWorkspaceTab({ id: `exploration:${result.id}`, type: 'exploration', name: result.id });
          emitWorkspaceEvent('explore_this_used', { source_type: obj.type });
        }
      });
    },
    [createExploration, openWorkspaceTab, buildExplorationSeedState]
  );
  const handleCtxAddToExploration = useCallback(
    (obj) => {
      addObjectToActiveExploration && addObjectToActiveExploration(obj);
    },
    [addObjectToActiveExploration]
  );

  return (
    <div data-testid="lineage-canvas" className="flex h-full w-full flex-col">
      <Lineage
        scopeSelector={effectiveSelector}
        onNodeSelect={handleNodeSelect}
        onNodeContextMenu={handleNodeContextMenu}
        onResetScope={handleResetScope}
      />
      {ctxMenu && (
        <OpenObjectContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          obj={ctxMenu.obj}
          onOpen={handleCtxOpen}
          onOpenInNewTab={handleCtxOpenInNewTab}
          onExploreThis={
            EXPLORE_THIS_TYPES.includes(ctxMenu.obj?.type) ? handleCtxExploreThis : undefined
          }
          onAddToExploration={
            canAddToExploration && EXPLORATION_DRAG_TYPES.includes(ctxMenu.obj?.type)
              ? handleCtxAddToExploration
              : undefined
          }
          onDismiss={dismissCtxMenu}
          testIdPrefix="lineage-node-ctx"
        />
      )}
    </div>
  );
};

export default LineageCanvas;
