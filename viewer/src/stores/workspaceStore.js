/**
 * Workspace Store Slice (VIS-775 / Track B B2)
 *
 * Tab + active-object state for the Workspace shell. The Workspace shell is
 * always editing — `/workspace` and `/project` are separate routes, not a
 * mode toggle. State held here:
 *
 *   - `workspaceTabs`         — ordered array of tab descriptors.
 *   - `workspaceActiveTabId`  — id of the currently active tab.
 *   - `workspaceActiveObject` — `{ type, name }` mirror of the active tab,
 *                               maintained in sync by the tab actions so
 *                               consumers (RightRail, MiddlePane, collapsed-
 *                               rail indicators, etc.) can read it directly
 *                               without a derivation hook.
 *   - `workspaceLeftCollapsed` / `workspaceRightCollapsed` — rail collapse.
 *   - `workspaceRightTab`    — which right-rail tab is active.
 *   - `workspaceLens`        — sub-bar lens for the active object.
 *   - `workspaceOutlineSelectedKey` — which Outline-tree node is selected
 *     (`'dashboard'` | `'row.N'` | `'row.N.item.M'`). Drives the mulberry
 *     selection highlight in `<OutlineTreePanel>`; the canvas (Track D) will
 *     consume the same key to highlight the matching node once it lands.
 *
 * Each tab descriptor: `{ id, type, name, dirty }` where:
 *   - `id`    — stable per-tab string identifier (e.g. `project:<projectName>`
 *               or `dashboard:simple-dashboard`).
 *   - `type`  — `project` for the workspace-chrome project tab, or any of
 *     the 13 canonical data-object types from `objectTypeConfigs.js` (e.g.,
 *               insight | model | source`).
 *   - `name`  — display name (also the underlying object name for non-project
 *               types).
 *   - `dirty` — boolean indicating unsaved edits (the mulberry dot in the
 *               tab strip). Phase 0 leaves this manually toggled — Track H
 *               (auto-save) and VIS-O3 (dirty confirmation) wire it up.
 *
 * Per the delivered B-1 design (`design/cofounder-mockups/`), the **project is
 * a first-class tab**: opening `/workspace` adds a project tab if one doesn't
 * exist yet, and the project tab is what users see by default. Multi-tab,
 * drag-reorder, right-click-open-in-new-tab semantics ship in VIS-O1 / O2 /
 * O3 — this slice only carries the state the shell needs in Phase 0.
 */

const createWorkspaceSlice = (set, get) => ({
  // Tabs --------------------------------------------------------------------
  workspaceTabs: [],
  workspaceActiveTabId: null,
  workspaceActiveObject: null, // `{ type, name }` mirror of the active tab.

  // Rails -------------------------------------------------------------------
  workspaceLeftCollapsed: false,
  workspaceRightCollapsed: false,
  workspaceRightTab: 'edit', // 'outline' | 'edit'

  // Lens (sub-bar segmented) ------------------------------------------------
  workspaceLens: 'preview', // 'preview' | 'lineage'

  // Outline tree (right-rail Outline tab, VIS-793 / Track F F-3) ------------
  // Selected node key — `'dashboard'` | `'row.N'` | `'row.N.item.M'`. Defaults
  // to the dashboard root so the scoped dashboard reads as selected on entry.
  workspaceOutlineSelectedKey: 'dashboard',

  // Resize state (Phase 0 visual stub; actual resizing comes later) --------
  workspaceLeftWidth: 320,
  workspaceRightWidth: 360,
  workspaceResizing: null, // 'left' | 'right' | null

  // ------------------------------------------------------------------------
  // Tab actions
  // ------------------------------------------------------------------------

  /**
   * Open a tab (or focus it if already open). Returns the focused tab id.
   *
   * `tab` shape: `{ id?, type, name, dirty? }`. `id` defaults to
   * `<type>:<name>` so opening the same object twice focuses the existing tab.
   */
  openWorkspaceTab: (tab) => {
    if (!tab || !tab.type || !tab.name) return null;
    const id = tab.id || `${tab.type}:${tab.name}`;
    const state = get();
    const existing = state.workspaceTabs.find((t) => t.id === id);
    const activeObject = { type: tab.type, name: tab.name };
    if (existing) {
      set({ workspaceActiveTabId: id, workspaceActiveObject: activeObject });
      return id;
    }
    const next = {
      id,
      type: tab.type,
      name: tab.name,
      dirty: !!tab.dirty,
    };
    set({
      workspaceTabs: [...state.workspaceTabs, next],
      workspaceActiveTabId: id,
      workspaceActiveObject: activeObject,
    });
    return id;
  },

  /** Focus a tab by id without opening anything new. No-op if id unknown. */
  switchWorkspaceTab: (tabId) => {
    const state = get();
    const tab = state.workspaceTabs.find((t) => t.id === tabId);
    if (!tab) return;
    set({
      workspaceActiveTabId: tabId,
      workspaceActiveObject: { type: tab.type, name: tab.name },
    });
  },

  /**
   * Close a tab. If the closed tab was active, focus shifts to the
   * preceding tab (or `null` if no tabs remain). Dirty-confirmation
   * semantics (VIS-O3) are deferred — callers handle their own guard.
   */
  closeWorkspaceTab: (tabId) => {
    const state = get();
    const idx = state.workspaceTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const remaining = state.workspaceTabs.filter((t) => t.id !== tabId);
    let activeId = state.workspaceActiveTabId;
    let activeObject = state.workspaceActiveObject;
    if (activeId === tabId) {
      if (remaining.length === 0) {
        activeId = null;
        activeObject = null;
      } else {
        const newActive = remaining[Math.max(0, idx - 1)];
        activeId = newActive.id;
        activeObject = { type: newActive.type, name: newActive.name };
      }
    }
    set({
      workspaceTabs: remaining,
      workspaceActiveTabId: activeId,
      workspaceActiveObject: activeObject,
    });
  },

  /**
   * Reorder a tab — move `activeId` to the slot currently occupied by
   * `overId`. No-op when the ids are the same or either is unknown. Used
   * by the TabStrip's drag-reorder gesture.
   */
  reorderWorkspaceTabs: (activeId, overId) => {
    if (!activeId || activeId === overId) return;
    const state = get();
    const fromIdx = state.workspaceTabs.findIndex((t) => t.id === activeId);
    const toIdx = state.workspaceTabs.findIndex((t) => t.id === overId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...state.workspaceTabs];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    set({ workspaceTabs: next });
  },

  /** Mark a tab dirty/clean — drives the mulberry dot in the tab strip. */
  setWorkspaceTabDirty: (tabId, dirty) => {
    const state = get();
    set({
      workspaceTabs: state.workspaceTabs.map((t) =>
        t.id === tabId ? { ...t, dirty: !!dirty } : t
      ),
    });
  },

  // ------------------------------------------------------------------------
  // Rail / lens actions
  // ------------------------------------------------------------------------

  toggleWorkspaceLeftCollapsed: () => {
    set((s) => ({ workspaceLeftCollapsed: !s.workspaceLeftCollapsed }));
  },

  toggleWorkspaceRightCollapsed: () => {
    set((s) => ({ workspaceRightCollapsed: !s.workspaceRightCollapsed }));
  },

  setWorkspaceRightTab: (tab) => {
    if (!['outline', 'edit'].includes(tab)) return;
    set({ workspaceRightTab: tab });
  },

  setWorkspaceLens: (lens) => {
    if (!['preview', 'lineage'].includes(lens)) return;
    set({ workspaceLens: lens });
  },

  // ------------------------------------------------------------------------
  // Outline-tree actions (VIS-793 / Track F F-3)
  // ------------------------------------------------------------------------

  /**
   * Select an Outline-tree node. `key` is one of `'dashboard'`, `'row.N'`,
   * `'row.N.item.M'`. Persisted on the workspace slice so the canvas (Track D)
   * can highlight the same node once it lands.
   */
  setWorkspaceOutlineSelectedKey: (key) => {
    if (typeof key !== 'string' || !key) return;
    set({ workspaceOutlineSelectedKey: key });
  },

  /**
   * Append an empty row to a dashboard's draft config and persist it via the
   * dashboard draft cache. Optimistically updates the in-memory `dashboards`
   * list so the Outline tree (and canvas) reflect the new row immediately,
   * then calls `saveDashboard` to write the draft. No-op if the dashboard
   * can't be found. Returns the new row index, or `null` on no-op.
   */
  addDashboardRow: (dashboardName) => {
    if (!dashboardName) return null;
    const state = get();
    const list = state.dashboards || [];
    const idx = list.findIndex((d) => d.name === dashboardName);
    if (idx === -1) return null;

    const entry = list[idx];
    const config = entry.config || entry;
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const newRow = { height: 'medium', items: [] };
    const nextRows = [...rows, newRow];
    const nextConfig = { ...config, rows: nextRows };

    const nextEntry = entry.config
      ? { ...entry, config: nextConfig }
      : nextConfig;
    const nextList = [...list];
    nextList[idx] = nextEntry;

    const newRowIndex = nextRows.length - 1;
    set({
      dashboards: nextList,
      workspaceOutlineSelectedKey: `row.${newRowIndex}`,
    });

    // Persist the draft. saveDashboard re-fetches, which reconciles the
    // optimistic update above with the server's canonical config.
    if (typeof state.saveDashboard === 'function') {
      state.saveDashboard(dashboardName, nextConfig);
    }

    return newRowIndex;
  },

  // ------------------------------------------------------------------------
  // Rail-resize actions — min/max clamps centralised here so DragHandle just
  // hands over the raw mouse-derived width.
  // ------------------------------------------------------------------------

  setWorkspaceLeftWidth: (width) => {
    set({ workspaceLeftWidth: Math.min(Math.max(width, 240), 480) });
  },

  setWorkspaceRightWidth: (width) => {
    set({ workspaceRightWidth: Math.min(Math.max(width, 280), 560) });
  },

  setWorkspaceResizing: (value) => {
    if (value !== null && value !== 'left' && value !== 'right') return;
    set({ workspaceResizing: value });
  },

  /**
   * Replace the entire tab set in one shot. Used by the Workspace shell on
   * mount to hydrate a project tab from the loaded project. Avoids the
   * double-render of openWorkspaceTab when the caller knows exactly what the
   * tab strip should look like.
   */
  hydrateWorkspaceTabs: (tabs, activeTabId) => {
    const safeTabs = tabs || [];
    const activeId = activeTabId || (safeTabs[0] ? safeTabs[0].id : null);
    const activeTab = safeTabs.find((t) => t.id === activeId) || null;
    set({
      workspaceTabs: safeTabs,
      workspaceActiveTabId: activeId,
      workspaceActiveObject: activeTab
        ? { type: activeTab.type, name: activeTab.name }
        : null,
    });
  },
});

export default createWorkspaceSlice;
