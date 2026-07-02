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

import { emitWorkspaceEvent } from '../components/views/workspace/telemetry';
import { generateUniqueName } from '../utils/uniqueName';

const createWorkspaceSlice = (set, get) => ({
  // Tabs --------------------------------------------------------------------
  workspaceTabs: [],
  workspaceActiveTabId: null,
  workspaceActiveObject: null, // `{ type, name }` mirror of the active tab.

  // Dirty-close confirmation (VIS-812 / O-3): the tab id awaiting the user's
  // confirm/cancel in the close dialog, or null when no close is pending.
  workspacePendingCloseTabId: null,

  // Rails -------------------------------------------------------------------
  workspaceLeftCollapsed: false,
  workspaceRightCollapsed: false,
  workspaceRightTab: 'edit', // 'outline' | 'edit'

  // Lens (sub-bar segmented) ------------------------------------------------
  workspaceLens: 'preview', // 'preview' | 'lineage'

  // One-shot, object-scoped lens request (VIS-779). A lineage node click
  // round-trips the selection into the workspace AND asks for the new
  // object's pane to open on the Lineage lens — same shape as the
  // `?edit=…&lens=lineage` deep link, and like it, scoped to one objectKey
  // so it can never leak to a later selection. The consuming pane clears it.
  workspaceLensIntent: null, // { objectKey: 'type:name', lens: 'lineage' } | null

  // Pivot playground draft (table `build` lens, VIS-1008) --------------------
  // The in-flight pivot config the drag-to-shelf builder owns while the user
  // composes it: `{ tableName, columns, rows, values }`. `columns`/`rows` are
  // arrays of `${ref(name).field}` strings; `values` are aggregation expressions
  // (`sum(${ref(name).field})`). Seeded from the table record on lens open,
  // re-runs the live result on every change, and committed back through the
  // table store's `saveTable` on an explicit Save. Null when no build lens is
  // open. Scoped by `tableName` so it can't leak across object selections.
  workspacePivotDraft: null,

  // Outline tree (right-rail Outline tab, VIS-793 / Track F F-3) ------------
  // Selected node key — `'dashboard'` | `'row.N'` | `'row.N.item.M'`. Defaults
  // to the dashboard root so the scoped dashboard reads as selected on entry.
  workspaceOutlineSelectedKey: 'dashboard',

  // Canvas hover key — the composite `data-canvas-path` of the row/item the
  // cursor is currently over on the dashboard canvas (`null` over chrome/empty).
  // Written by CanvasSelectionOverlay (the single hover source) and read by
  // CanvasDndLayer so drag-grips reveal on hover-or-selection rather than always
  // being painted (VIS-771 follow-up). Kept out of the Outline selection key so
  // hovering never mutates selection.
  workspaceCanvasHoverKey: null,

  // Source outline (right-rail "Data" tab when a `source` is the active object,
  // VIS-1004). A DISJOINT selection-key grammar from the dashboard outline so
  // the two consumers never collide:
  //   `source-outline::<src>::db::<d>` ·
  //   `…::schema::<s>` · `…::table::<t>` · `…::col::<c>`
  // The dashboard's `parseOutlineKey` safely falls through for these keys (it
  // only recognises `dashboard` / `row.N` / `row.N.item.M`), and this lives on
  // its own store key so a source selection can never leak into the dashboard
  // Edit form. `null` = nothing selected in the source tree.
  workspaceSourceOutlineSelectedKey: null,

  // Per-source, per-session expand/collapse memory for the source outline. Keyed
  // by source name → array of expanded node keys (db/schema/table). Arrays (not
  // Sets) keep the slice serialisable and test-friendly; the panel rehydrates a
  // Set from these on render. NOT persisted across reloads — session-only, as the
  // schema can change between sessions (VIS-1004 §8.5).
  workspaceSourceOutlineExpanded: {},

  // Per-SESSION cache of the (expensive) source introspection result, keyed by
  // source name → { nodes, status, error }. Live introspection is costly for
  // warehouses (Snowflake/BigQuery), so the source outline reads this cache on
  // re-select instead of re-introspecting every mount; a manual reload refreshes
  // it. Session-only (schema can change between sessions). (VIS-1004 caching.)
  workspaceSourceOutlineDataCache: {},

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
      if (state.workspaceActiveTabId !== id) {
        emitWorkspaceEvent('tab_switched', { id, type: tab.type, name: tab.name, via: 'open' });
      }
      set({ workspaceActiveTabId: id, workspaceActiveObject: activeObject });
      return id;
    }
    const next = {
      id,
      type: tab.type,
      name: tab.name,
      dirty: !!tab.dirty,
    };
    emitWorkspaceEvent('tab_opened', {
      id,
      type: tab.type,
      name: tab.name,
      background: false,
    });
    set({
      workspaceTabs: [...state.workspaceTabs, next],
      workspaceActiveTabId: id,
      workspaceActiveObject: activeObject,
    });
    return id;
  },

  /**
   * Open a tab WITHOUT focusing it (VIS-811 / O-2). The convention for
   * right-click "Open in new tab": the tab joins the strip in the background
   * and the current context is untouched (per the Track O spec — "creates a
   * new tab; clicking the tab switches the workspace context"). If the tab
   * is already open this is a no-op (it keeps its position and focus stays
   * where it is). Returns the tab id, or null on bad input.
   */
  openWorkspaceTabBackground: (tab) => {
    if (!tab || !tab.type || !tab.name) return null;
    const id = tab.id || `${tab.type}:${tab.name}`;
    const state = get();
    if (state.workspaceTabs.some((t) => t.id === id)) return id;
    const next = { id, type: tab.type, name: tab.name, dirty: !!tab.dirty };
    emitWorkspaceEvent('tab_opened', {
      id,
      type: tab.type,
      name: tab.name,
      background: true,
    });
    set({ workspaceTabs: [...state.workspaceTabs, next] });
    return id;
  },

  /** Focus a tab by id without opening anything new. No-op if id unknown. */
  switchWorkspaceTab: (tabId) => {
    const state = get();
    const tab = state.workspaceTabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (state.workspaceActiveTabId !== tabId) {
      emitWorkspaceEvent('tab_switched', { id: tabId, type: tab.type, name: tab.name });
    }
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
    const closing = state.workspaceTabs[idx];
    emitWorkspaceEvent('tab_closed', {
      id: tabId,
      type: closing.type,
      name: closing.name,
      dirty: !!closing.dirty,
    });
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
      // A tab closed by any path can't stay parked in the confirm dialog.
      workspacePendingCloseTabId:
        state.workspacePendingCloseTabId === tabId ? null : state.workspacePendingCloseTabId,
    });
  },

  /**
   * Close a tab THROUGH the dirty guard (VIS-812 / O-3). Clean tabs close
   * immediately; dirty tabs park their id in `workspacePendingCloseTabId`
   * so the TabStrip's confirmation dialog can ask first. The × button and
   * Cmd/Ctrl+W both route through here; `closeWorkspaceTab` stays the
   * unguarded primitive (the dialog's "Close without saving" calls it).
   */
  requestCloseWorkspaceTab: (tabId) => {
    const state = get();
    const tab = state.workspaceTabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.dirty) {
      set({ workspacePendingCloseTabId: tabId });
      return;
    }
    state.closeWorkspaceTab(tabId);
  },

  /** Confirm the pending dirty close — closes the tab and clears the pending id. */
  confirmCloseWorkspaceTab: () => {
    const state = get();
    const tabId = state.workspacePendingCloseTabId;
    if (!tabId) return;
    set({ workspacePendingCloseTabId: null });
    state.closeWorkspaceTab(tabId);
  },

  /** Cancel the pending dirty close — the tab stays open and dirty. */
  cancelCloseWorkspaceTab: () => {
    set({ workspacePendingCloseTabId: null });
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
    const previous = get().workspaceLens;
    set({ workspaceLens: lens });
    // `middle_pane_toggled` telemetry (§3.4, VIS-797). Lineage ENTRIES are
    // emitted by <LineageCanvas> on mount (with the richer scope/selector
    // payload) — emitting the lineage direction here too would double-count a
    // single toggle. The canvas/preview direction has no mount site of its
    // own, so the explicit toggle-back is captured here, tagged with the
    // scope at toggle time per the spec.
    if (lens === 'preview' && previous !== 'preview') {
      const activeObject = get().workspaceActiveObject;
      const scope =
        !activeObject || activeObject.type === 'project'
          ? 'root'
          : activeObject.type === 'dashboard'
            ? 'dashboard'
            : 'item';
      emitWorkspaceEvent('middle_pane_toggled', {
        pane: 'canvas',
        scope,
        dashboardName: activeObject?.type === 'dashboard' ? activeObject.name : null,
      });
    }
  },

  setWorkspaceLensIntent: (intent) => {
    if (intent && (!intent.objectKey || !['preview', 'lineage'].includes(intent.lens))) return;
    set({ workspaceLensIntent: intent || null });
  },

  clearWorkspaceLensIntent: () => {
    set({ workspaceLensIntent: null });
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
   * Set the canvas hover key (or `null` to clear). Used only to reveal canvas
   * drag-grips on hover; never affects the Outline selection.
   */
  setWorkspaceCanvasHoverKey: (key) => {
    set(state =>
      state.workspaceCanvasHoverKey === (key || null)
        ? state
        : { workspaceCanvasHoverKey: key || null }
    );
  },

  /**
   * Select a node in the source outline (VIS-1004). `key` follows the disjoint
   * `source-outline::…` grammar; passing the already-selected key (or `null`)
   * toggles the selection off. Stored separately from the dashboard outline key
   * so the two never collide.
   */
  setWorkspaceSourceOutlineSelectedKey: (key) => {
    if (key != null && typeof key !== 'string') return;
    set(state => ({
      workspaceSourceOutlineSelectedKey:
        state.workspaceSourceOutlineSelectedKey === key ? null : key || null,
    }));
  },

  /**
   * Toggle a node's expand state in the source outline for a given source.
   * Per-source, per-session — `sourceName` partitions the expanded set so two
   * sources keep independent disclosure state.
   */
  toggleWorkspaceSourceOutlineExpanded: (sourceName, nodeKey) => {
    if (!sourceName || !nodeKey) return;
    set(state => {
      const current = state.workspaceSourceOutlineExpanded[sourceName] || [];
      const next = current.includes(nodeKey)
        ? current.filter(k => k !== nodeKey)
        : [...current, nodeKey];
      return {
        workspaceSourceOutlineExpanded: {
          ...state.workspaceSourceOutlineExpanded,
          [sourceName]: next,
        },
      };
    });
  },

  /**
   * Replace the expanded-node set for a source (e.g. auto-expanding the tree
   * after a cold-source schema generation completes). `nodeKeys` is an array.
   */
  setWorkspaceSourceOutlineExpanded: (sourceName, nodeKeys) => {
    if (!sourceName || !Array.isArray(nodeKeys)) return;
    set(state => ({
      workspaceSourceOutlineExpanded: {
        ...state.workspaceSourceOutlineExpanded,
        [sourceName]: nodeKeys,
      },
    }));
  },

  // Cache the introspected outline data for a source so re-selecting it doesn't
  // re-introspect (VIS-1004 caching). Pass `null` payload to evict (force a
  // reload to re-fetch).
  setWorkspaceSourceOutlineData: (sourceName, payload) => {
    if (!sourceName) return;
    set(state => {
      const cache = { ...state.workspaceSourceOutlineDataCache };
      if (payload == null) delete cache[sourceName];
      else cache[sourceName] = payload;
      return { workspaceSourceOutlineDataCache: cache };
    });
  },

  /**
   * Optimistically replace a dashboard's draft config in the in-memory
   * `dashboards` list WITHOUT persisting. The right-rail Edit forms (VIS-802)
   * call this on every change so the Outline tree, canvas, and the form's own
   * RefDropZones reflect the edit immediately; the debounced `saveDashboard`
   * runs separately. No-op (returns false) when the dashboard isn't found.
   *
   * Mirrors `addDashboardRow`'s optimistic write but decoupled from the save so
   * the UI never has to wait on (or be blocked by) a backend round-trip.
   */
  updateDashboardConfigOptimistic: (dashboardName, nextConfig) => {
    if (!dashboardName) return false;
    const state = get();
    const list = state.dashboards || [];
    const idx = list.findIndex((d) => d.name === dashboardName);
    if (idx === -1) return false;
    const entry = list[idx];
    const nextEntry = entry.config ? { ...entry, config: nextConfig } : nextConfig;
    const nextList = [...list];
    nextList[idx] = nextEntry;
    set({ dashboards: nextList });
    return true;
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

  // Pivot playground draft actions (VIS-1008) -------------------------------
  /**
   * Replace the pivot build draft. Accepts a full draft object
   * `{ tableName, columns, rows, values }`; missing shelf arrays default to
   * empty so consumers can always spread them safely. A falsy draft clears it.
   */
  setWorkspacePivotDraft: (draft) => {
    if (!draft) {
      set({ workspacePivotDraft: null });
      return;
    }
    set({
      workspacePivotDraft: {
        tableName: draft.tableName ?? null,
        columns: Array.isArray(draft.columns) ? draft.columns : [],
        rows: Array.isArray(draft.rows) ? draft.rows : [],
        values: Array.isArray(draft.values) ? draft.values : [],
      },
    });
  },

  /** Clear the pivot build draft (on lens close / object change). */
  resetWorkspacePivotDraft: () => {
    set({ workspacePivotDraft: null });
  },

  /**
   * Commit the current pivot build draft back to its table through the table
   * store's `saveTable(name, config)` action. Merges the draft's three pivot
   * shelves onto the table's existing config so non-pivot fields (rows_per_page,
   * format_cells, …) are preserved — EXCEPT `data`: the table model rejects a
   * `data` ref coexisting with columns/rows/values, so committing a pivot draft
   * converts a data-backed table to columns-based. Returns the `saveTable`
   * result (a promise resolving to `{ success, … }`), or `{ success: false }`
   * when there's no draft / no save action.
   */
  commitWorkspacePivotDraft: async () => {
    const draft = get().workspacePivotDraft;
    const saveTable = get().saveTable;
    if (!draft || !draft.tableName || typeof saveTable !== 'function') {
      return { success: false, error: 'No pivot draft to commit' };
    }
    const tables = get().tables || [];
    const record = tables.find((t) => t.name === draft.tableName) || null;
    const existing = record ? record.config || record : {};
    const nextConfig = {
      ...existing,
      name: draft.tableName,
      columns: draft.columns,
      rows: draft.rows,
      values: draft.values,
    };
    // The draft's ${ref(...)} shelves already bind the table to its parent;
    // keeping `data` alongside them makes the backend reject the save.
    delete nextConfig.data;
    return saveTable(draft.tableName, nextConfig);
  },

  /**
   * Commit the current pivot build draft as a BRAND-NEW table (the "Add as a new
   * table" path from the pivot Save modal). Generates a unique name from the
   * source table's name + the existing tables, creates a fresh table config
   * carrying only the three pivot shelves, persists it via `saveTable`, and (on
   * success) opens it as a workspace tab. Returns `{ success, name }` so callers
   * can react (open the tab, toast, …). The original table is left untouched.
   */
  commitWorkspacePivotDraftAsNew: async () => {
    const draft = get().workspacePivotDraft;
    const saveTable = get().saveTable;
    if (!draft || typeof saveTable !== 'function') {
      return { success: false, error: 'No pivot draft to commit' };
    }
    const tables = get().tables || [];
    const existingNames = tables.map((t) => t.name).filter(Boolean);
    const base = draft.tableName ? `${draft.tableName}_pivot` : 'pivot_table';
    const newName = generateUniqueName(base, existingNames);

    const sourceRecord = tables.find((t) => t.name === draft.tableName) || null;
    const sourceConfig = sourceRecord ? sourceRecord.config || sourceRecord : {};
    // Carry forward the source table's non-pivot display config. `data` is
    // deliberately NOT carried: the table model rejects a `data` ref coexisting
    // with columns/rows/values, and the draft's ${ref(...)} shelves already
    // bind the new table to the same parent.
    const { format_cells, rows_per_page } = sourceConfig;
    const nextConfig = {
      ...(format_cells !== undefined ? { format_cells } : {}),
      ...(rows_per_page !== undefined ? { rows_per_page } : {}),
      name: newName,
      columns: draft.columns,
      rows: draft.rows,
      values: draft.values,
    };

    const result = await saveTable(newName, nextConfig);
    if (result && result.success) {
      const openTab = get().openWorkspaceTab;
      if (typeof openTab === 'function') {
        openTab({ type: 'table', name: newName });
      }
    }
    return { ...(result || {}), name: newName };
  },
});

export default createWorkspaceSlice;
