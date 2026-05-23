/**
 * Workspace Store Slice (VIS-775 / Track B B2)
 *
 * Tab + active-object state for the Workspace shell. The Workspace shell is
 * always editing — `/workspace` and `/project` are separate routes, not a
 * mode toggle. State held here:
 *
 *   - `workspaceTabs`        — ordered array of tab descriptors.
 *   - `workspaceActiveTabId` — id of the currently active tab (drives the
 *                              middle pane + right rail content).
 *   - `workspaceLeftCollapsed` / `workspaceRightCollapsed` — rail collapse.
 *   - `workspaceRightTab`    — which right-rail tab is active.
 *   - `workspaceLens`        — sub-bar lens for the active object.
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

  // Rails -------------------------------------------------------------------
  workspaceLeftCollapsed: false,
  workspaceRightCollapsed: false,
  workspaceRightTab: 'edit', // 'outline' | 'edit'

  // Lens (sub-bar segmented) ------------------------------------------------
  workspaceLens: 'preview', // 'preview' | 'lineage'

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
    if (existing) {
      set({ workspaceActiveTabId: id });
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
    });
    return id;
  },

  /** Focus a tab by id without opening anything new. No-op if id unknown. */
  switchWorkspaceTab: (tabId) => {
    const state = get();
    if (!state.workspaceTabs.some((t) => t.id === tabId)) return;
    set({ workspaceActiveTabId: tabId });
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
    if (activeId === tabId) {
      if (remaining.length === 0) activeId = null;
      else activeId = remaining[Math.max(0, idx - 1)].id;
    }
    set({
      workspaceTabs: remaining,
      workspaceActiveTabId: activeId,
    });
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

  /**
   * Replace the entire tab set in one shot. Used by the Workspace shell on
   * mount to hydrate a project tab from the loaded project. Avoids the
   * double-render of openWorkspaceTab when the caller knows exactly what the
   * tab strip should look like.
   */
  hydrateWorkspaceTabs: (tabs, activeTabId) => {
    set({
      workspaceTabs: tabs || [],
      workspaceActiveTabId: activeTabId || (tabs && tabs[0] ? tabs[0].id : null),
    });
  },
});

export default createWorkspaceSlice;
