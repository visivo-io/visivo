import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useStore from '../../../stores/store';

/**
 * useWorkspaceScope — VIS-775 (Track B B2).
 *
 * Single source of truth for what the Workspace is currently focused on. The
 * scope is derived from URL state (route params + query string) and the
 * workspace store (active tab). Consumers: Library left rail (filters items
 * by scope), MiddlePane (decides which preview to mount), right rail
 * (drives Outline + Edit content), telemetry (events tag the active scope).
 *
 * Returns:
 *
 *   {
 *     scope:           'root' | 'dashboard' | 'item' | 'level' | 'project',
 *     selector:        string,           // Lineage-selector form ('*', '+name', etc.)
 *     dashboardName:   string | null,    // current dashboard, if any
 *     selectedItem:    { type, name }|null  // active object the right rail is bound to
 *   }
 *
 * Scope semantics, in order of precedence:
 *
 *   1. `:dashboardName` URL param → `dashboard` scope.
 *   2. `?edit=<type>:<name>` query (Q19 redirect target) → `item` scope.
 *   3. Active workspace tab whose type is not `project` → matches tab's
 *      scope. Tabs are how multi-object editing is plumbed; the URL still
 *      shows `/workspace` for non-dashboard objects in Phase 0.
 *   4. Otherwise `root` (the unscoped Project Editor surface). The project
 *      tab is the implicit selected item — Edit form binds to the project.
 *
 * NB: this hook does not subscribe to URL changes itself — it relies on
 * `useParams` / `useSearchParams` (which do). Selector strings follow the
 * Visivo lineage-selector grammar (`+name` = ancestors + descendants).
 */
export function useWorkspaceScope() {
  const { dashboardName } = useParams();
  const [searchParams] = useSearchParams();

  // Tab state — used as a tertiary source after the URL (the URL is canonical
  // for dashboards; tabs are for object selection in Phase 0).
  const tabs = useStore((s) => s.workspaceTabs);
  const activeTabId = useStore((s) => s.workspaceActiveTabId);

  // Active tab object (memoised so consumers can rely on referential
  // stability across renders that don't actually change scope).
  const activeTab = useMemo(
    () => (tabs || []).find((t) => t.id === activeTabId) || null,
    [tabs, activeTabId]
  );

  return useMemo(() => {
    // Active workspace tab pointing at a non-dashboard, non-project object
    // takes precedence over a lingering `:dashboardName` URL param. When a
    // user expands a chart/model/insight/etc. (via the Library flip-popover
    // "Expand" or a Lineage node click) while still on a
    // `/workspace/dashboard/:name` route, the route param does NOT change
    // (E-1 requires the route to stay put), but the explicitly-focused
    // object must scope the Lineage lens to ITS OWN DAG — not the dashboard's
    // (VIS-779 universal lineage). Dashboards and the project keep deferring
    // to the URL param below, so the initial dashboard load is unaffected.
    if (activeTab && activeTab.type !== 'project' && activeTab.type !== 'dashboard') {
      return {
        scope: 'item',
        selector: `+${activeTab.name}`,
        dashboardName: dashboardName || null,
        selectedItem: { type: activeTab.type, name: activeTab.name },
      };
    }

    // Dashboard scope — URL is canonical.
    if (dashboardName) {
      return {
        scope: 'dashboard',
        selector: `+${dashboardName}`,
        dashboardName,
        selectedItem: { type: 'dashboard', name: dashboardName },
      };
    }

    // `?edit=<type>:<name>` — used by /editor/<type>/<name> redirect path.
    const editParam = searchParams.get('edit');
    if (editParam && editParam.includes(':')) {
      const [type, ...rest] = editParam.split(':');
      const name = rest.join(':');
      if (type && name) {
        return {
          scope: 'item',
          selector: `+${name}`,
          dashboardName: null,
          selectedItem: { type, name },
        };
      }
    }

    // Active workspace tab (non-project) — scopes by tab.
    if (activeTab && activeTab.type !== 'project') {
      return {
        scope: activeTab.type === 'dashboard' ? 'dashboard' : 'item',
        selector: `+${activeTab.name}`,
        dashboardName: activeTab.type === 'dashboard' ? activeTab.name : null,
        selectedItem: { type: activeTab.type, name: activeTab.name },
      };
    }

    // Unscoped — Project Editor surface. Selected item is the project
    // itself (so the right-rail Edit form binds to project chrome).
    const projectName = activeTab && activeTab.type === 'project' ? activeTab.name : null;
    return {
      scope: 'root',
      selector: '*',
      dashboardName: null,
      selectedItem: projectName ? { type: 'project', name: projectName } : null,
    };
  }, [dashboardName, searchParams, activeTab]);
}

export default useWorkspaceScope;
