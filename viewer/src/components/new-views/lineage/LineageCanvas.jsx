import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PiTreeStructure, PiArrowCounterClockwise } from 'react-icons/pi';
import LineageNew from './LineageNew';
import useStore from '../../../stores/store';
import { useWorkspaceScope } from '../workspace/useWorkspaceScope';
import { emitWorkspaceEvent } from '../workspace/telemetry';

/**
 * LineageCanvas — VIS-E1 (VIS-779 / Track E).
 *
 * A thin wrapper around the existing `<LineageNew>` React Flow DAG. It mounts
 * in the Workspace middle pane when the dashboard lens is set to "lineage"
 * (replacing the Track-E placeholder).
 *
 * Responsibilities:
 *   - Derive the lineage `selector` from `useWorkspaceScope()`:
 *       · `*`              — unscoped (root / project).
 *       · `+<dashboardName>` — dashboard scope.
 *       · `+<itemName>`      — item scope.
 *   - Render the E-1 scope-indicator chrome above the DAG (flat white strip)
 *     describing WHY the user is seeing a subset, plus a "Show full project"
 *     affordance that widens the scope back to `*` WITHOUT changing the route.
 *   - Round-trip selection: clicking a node updates the workspace selection
 *     via `openWorkspaceTab` (and the scope, in turn, re-derives the selector).
 *   - Fire the `middle_pane_toggled` telemetry event on lineage entry.
 *
 * The DAG itself, the manual selector input, zoom controls, and mini-map are
 * UNCHANGED — they ship exactly as today (the manual input still overrides the
 * scope-derived selector until the scope changes again).
 */
const LineageCanvas = () => {
  const { scope, selector, dashboardName, selectedItem } = useWorkspaceScope();
  const openWorkspaceTab = useStore((s) => s.openWorkspaceTab);

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
  const isScoped = effectiveSelector !== '*';

  // Human-readable description of the current scope for the indicator strip.
  const scopeLabel = useMemo(() => {
    if (!isScoped) return 'Full project';
    if (scope === 'dashboard' && dashboardName) return dashboardName;
    if (selectedItem?.name) return selectedItem.name;
    return effectiveSelector;
  }, [isScoped, scope, dashboardName, selectedItem, effectiveSelector]);

  const scopeKind = useMemo(() => {
    if (!isScoped) return null;
    if (scope === 'dashboard') return 'dashboard';
    return selectedItem?.type || 'item';
  }, [isScoped, scope, selectedItem]);

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
      if (openWorkspaceTab) {
        openWorkspaceTab({ id: `${obj.type}:${obj.name}`, type: obj.type, name: obj.name });
      }
      emitWorkspaceEvent('lineage_node_selected', { type: obj.type, name: obj.name });
    },
    [openWorkspaceTab]
  );

  const chrome = (
    <div
      data-testid="lineage-canvas-scope-bar"
      className="flex min-h-9 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5"
    >
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-gray-400">
        Scope
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          data-testid="lineage-canvas-scope-pill"
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary-100 px-2 text-[12px] font-medium text-primary-600"
        >
          <PiTreeStructure className="h-3.5 w-3.5" />
          <span className="font-semibold">{scopeLabel}</span>
          {scopeKind && (
            <span className="text-[10px] uppercase tracking-wider text-primary-600/70">
              {scopeKind}
            </span>
          )}
        </span>
      </div>
      {isScoped && (
        <button
          type="button"
          data-testid="lineage-canvas-reset-scope"
          onClick={handleResetScope}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:text-gray-900 hover:ring-gray-300"
        >
          <PiArrowCounterClockwise className="h-3.5 w-3.5" />
          Show full project
        </button>
      )}
    </div>
  );

  return (
    <div data-testid="lineage-canvas" className="flex h-full w-full flex-col">
      <LineageNew
        scopeSelector={effectiveSelector}
        onNodeSelect={handleNodeSelect}
        headerSlot={chrome}
      />
    </div>
  );
};

export default LineageCanvas;
