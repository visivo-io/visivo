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
import { COLLECTION_KEY } from '../components/views/workspace/collectionKeys';
import { unwrapConfig, withConfig } from '../components/views/workspace/unwrapRecordConfig';
import { workspaceTabUrl, workspaceViewUrl, WORKSPACE_BASE } from '../components/views/workspace/workspaceUrl';
import {
  isWorkspaceView,
  viewForDocumentType,
  DEFAULT_WORKSPACE_VIEW,
} from '../components/views/workspace/higherLevelViews';

/**
 * Two `{ type, name }` selection descriptors identify the same object.
 * Used by the tab actions to decide whether an outline-key reset is due:
 * moving to a DIFFERENT object invalidates any `row.N.item.M` key scoped to
 * the previous object's structure (VIS-994 / former VIS-978 stale-key bug).
 */
const sameWorkspaceObject = (a, b) => !!a && !!b && a.type === b.type && a.name === b.name;

/**
 * The outline-key reset patch for a transition from `previous` to `next`
 * active object — `{}` when the object is unchanged (keep the user's node
 * selection), the `'dashboard'` default otherwise.
 */
const outlineKeyResetFor = (previous, next) =>
  sameWorkspaceObject(previous, next) ? {} : { workspaceOutlineSelectedKey: 'dashboard' };

const createWorkspaceSlice = (set, get) => ({
  // Tabs --------------------------------------------------------------------
  workspaceTabs: [],
  workspaceActiveTabId: null,
  workspaceActiveObject: null, // `{ type, name }` mirror of the active tab.

  // The active DESTINATION (Project · Semantic Layer · Explorer — D1 in
  // specs/plan/explorer-workspace-unification). Views left the tab model in
  // Explore 2.0 Phase 0: they're never `workspaceTabs` records, never dirty,
  // never closable. `workspaceActiveObject`/`workspaceActiveTabId` stay null
  // while a view owns the center; opening any document tab sets THIS to that
  // document's owning destination (see `activateWorkspaceTab`), so closing
  // the last tab returns to the right Home instead of always resetting to
  // Project. Persists to localStorage alongside the tab set (`Workspace.jsx`).
  workspaceActiveView: DEFAULT_WORKSPACE_VIEW,

  // The active tab is URL-addressable (VIS thread: Back button + the URL as the
  // clean single loop). The Workspace registers the router's `navigate` here on
  // mount; the tab actions route the active SELECTION through it, and
  // `useWorkspaceUrlSync` reads the URL back into `workspaceActiveTabId`. When
  // no navigator is registered (unit tests / non-Workspace mounts) the actions
  // fall back to activating in-store synchronously, so callers keep working.
  workspaceUrlNavigate: null,
  registerWorkspaceUrlNavigate: fn => set({ workspaceUrlNavigate: fn || null }),

  // The mount prefix for the tab URLs above. Studio serves the viewer at the
  // root (`/workspace`); a host that mounts it under a path prefix (the cloud
  // app, at `/:account/:stage/:project/workspace`) registers its own base so
  // tab navigation stays inside the mount instead of escaping to the root. The
  // Workspace derives this from the URL on mount.
  workspaceUrlBase: WORKSPACE_BASE,
  registerWorkspaceUrlBase: base => set({ workspaceUrlBase: base || WORKSPACE_BASE }),

  // Dirty-close confirmation (VIS-812 / O-3): the tab id awaiting the user's
  // confirm/cancel in the close dialog, or null when no close is pending.
  workspacePendingCloseTabId: null,

  // A lightweight global toast queue (Explore 2.0 Phase 2): one-off notices
  // that must be visible regardless of which pane/tab is active — e.g.
  // "Churn dig was deleted" when Home's delete force-closes an open (even
  // parked) exploration tab (01-ux-spec.md §4). `{ message, key } | null`;
  // `key` re-triggers the Snackbar's appear animation for back-to-back toasts
  // with the same message. Rendered once, at WorkspaceShell.
  workspaceToast: null,

  showWorkspaceToast: (message) => {
    if (!message) return;
    set({ workspaceToast: { message, key: Date.now() } });
  },

  dismissWorkspaceToast: () => {
    set({ workspaceToast: null });
  },

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

  // Library source drill-down (Explore 2.0 Phase 3a / D9): does the Library's
  // "Sources" subsection have THIS source's row expanded at all (source →
  // schema → table → columns)? A DIFFERENT concept from
  // `workspaceSourceOutlineExpanded` above (which tracks expand state of
  // individual db/schema/table NODES once a source's tree is already being
  // shown) — this is the top-level gate that decides whether
  // `useSourceOutline(sourceName)` mounts at all for a given Library row, so
  // the drill-down is genuinely lazy: collapsed sources never fetch their
  // cached schema. Keyed by source name → boolean. Session-only, same
  // rationale as its sibling above (schema can change between sessions).
  librarySourceRowExpanded: {},

  toggleLibrarySourceRowExpanded: sourceName => {
    if (!sourceName) return;
    set(state => ({
      librarySourceRowExpanded: {
        ...state.librarySourceRowExpanded,
        [sourceName]: !state.librarySourceRowExpanded[sourceName],
      },
    }));
  },

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
   *
   * Navigates the URL AND activates in the store SYNCHRONOUSLY, in that
   * order. This used to ONLY navigate and rely on `Workspace.jsx`'s separate
   * URL→store sync `useEffect` (keyed on a `syncedTargetRef` value derived
   * from `location.pathname`) to actually add/focus the tab. That guard is
   * fundamentally racy: `closeWorkspaceTab` ALSO writes the store directly
   * and then separately navigates, so the store and the URL are two
   * independently-updating signals with no ordering guarantee between them
   * — closing a tab and immediately reopening the SAME document (the URL
   * returns to the exact string it had before, since ids are stable) can
   * leave the effect's memory of "already synced" matching the reopen's URL
   * even though the store no longer has the tab, so `activateWorkspaceTab`
   * never re-fires and the reopen hangs forever (VIS-1050 gate — observed
   * under real load: several concurrent browser instances competing for the
   * main thread). Activating here removes the dependency on that effect
   * entirely for the interactive path; `activateWorkspaceTab` is
   * idempotent, so the effect harmlessly re-confirms the same state
   * whenever it does run (still needed for browser back/forward and deep
   * links, which never call this function). Navigate BEFORE activating —
   * `history.pushState` (what the router's `navigate` calls under the hood)
   * updates `window.location` before React's own re-render of anything
   * reading it via `useLocation()`; activating first would let the document
   * finish mounting while a caller reading the URL synchronously (e.g. a
   * test's `page.url()`) still saw the PREVIOUS one.
   */
  openWorkspaceTab: (tab) => {
    if (!tab || !tab.type || !tab.name) return null;
    // Views (project/semantic-layer/explorer) left the tab model in Phase 0 —
    // route legacy `openWorkspaceTab({ type: 'semantic-layer', ... })`-shaped
    // calls (several still exist, e.g. `ProjectEditor`'s "Semantic Layer"
    // button) to the view action instead, so those call sites keep working
    // unmodified.
    if (isWorkspaceView(tab.type)) {
      get().openWorkspaceView(tab.type);
      return tab.type;
    }
    const nav = get().workspaceUrlNavigate;
    if (nav) {
      // Still route the URL — shareable links, the Back button's history,
      // and a fresh reload all read the URL as the source of truth.
      nav(workspaceTabUrl({ type: tab.type, name: tab.name }, get().workspaceUrlBase));
    }
    return get().activateWorkspaceTab(tab);
  },

  /**
   * Set the active tab IN THE STORE (ensure it's open, focus it). This is the
   * URL→store write called by `useWorkspaceUrlSync` once the URL changes (and
   * the no-router fallback for `openWorkspaceTab`). Nothing else should call it
   * directly — UI goes through `openWorkspaceTab` so the URL stays the source.
   *
   * Sets `workspaceActiveView` to the document's OWNING DESTINATION as a side
   * effect (01-ux-spec.md §1's deep-link rule) — this is the ONE write path
   * every document open (Library, deep link, context menu, switcher) funnels
   * through, so the rule can't be missed by a caller.
   */
  activateWorkspaceTab: (tab) => {
    if (!tab || !tab.type || !tab.name) return null;
    if (isWorkspaceView(tab.type)) {
      get().activateWorkspaceView(tab.type);
      return null;
    }
    const id = tab.id || `${tab.type}:${tab.name}`;
    const state = get();
    const existing = state.workspaceTabs.find((t) => t.id === id);
    const activeObject = { type: tab.type, name: tab.name };
    const keyReset = outlineKeyResetFor(state.workspaceActiveObject, activeObject);
    const owningView = viewForDocumentType(tab.type);
    if (existing) {
      if (state.workspaceActiveTabId !== id) {
        emitWorkspaceEvent('tab_switched', { id, type: tab.type, name: tab.name, via: 'open' });
      }
      set({
        workspaceActiveTabId: id,
        workspaceActiveObject: activeObject,
        workspaceActiveView: owningView,
        ...keyReset,
      });
      return id;
    }
    emitWorkspaceEvent('tab_opened', { id, type: tab.type, name: tab.name, background: false });
    set({
      workspaceTabs: [...state.workspaceTabs, { id, type: tab.type, name: tab.name, dirty: !!tab.dirty }],
      workspaceActiveTabId: id,
      workspaceActiveObject: activeObject,
      workspaceActiveView: owningView,
      ...keyReset,
    });
    return id;
  },

  /**
   * Activate a workspace VIEW — the store write for the three destinations
   * (Project / Semantic Layer / Explorer, D1). Parks any active document tab:
   * it stays open in the strip, just not focused (01-ux-spec.md §1 — "clicking
   * a view sets `workspaceActiveView` and releases the center from the active
   * document tab"). This is the URL→store write (mirrors `activateWorkspaceTab`);
   * UI should call `openWorkspaceView` so the URL stays the source of truth.
   */
  activateWorkspaceView: (view) => {
    if (!isWorkspaceView(view)) return;
    const state = get();
    if (state.workspaceActiveView !== view || state.workspaceActiveTabId) {
      emitWorkspaceEvent('view_activated', { view });
    }
    set({ workspaceActiveView: view, workspaceActiveTabId: null, workspaceActiveObject: null });
  },

  /**
   * UI entry point for switching views — navigates the URL AND activates in
   * the store synchronously (mirrors `openWorkspaceTab`'s comment for the
   * full rationale: don't depend entirely on the separate, racy URL→store
   * sync effect ever getting a correct-conclusion run for this transition;
   * navigate before activating so a synchronous URL read never lags).
   */
  openWorkspaceView: (view) => {
    if (!isWorkspaceView(view)) return;
    const state = get();
    const nav = state.workspaceUrlNavigate;
    if (nav) {
      nav(workspaceViewUrl(view, state.workspaceUrlBase));
    }
    state.activateWorkspaceView(view);
  },

  /**
   * Restore the OPEN-TAB SET from persistence (VIS thread: "if you refresh you
   * lose all the open tabs"). Replaces the strip WITHOUT focusing anything — the
   * active tab is restored separately from the URL. Sanitizes + de-dupes the
   * saved payload (dirty flags don't survive a reload) and SCRUBS any
   * `project`/`semantic-layer`/`explorer` records a pre-Phase-0 session may
   * have persisted — those types left the tab model entirely (01-ux-spec.md
   * §1's migration note), so a stale record must never resurrect as a
   * document tab.
   */
  restoreWorkspaceTabs: (tabs) => {
    if (!Array.isArray(tabs)) return;
    const seen = new Set();
    const restored = [];
    for (const t of tabs) {
      if (!t || !t.type || !t.name) continue;
      if (isWorkspaceView(t.type)) continue; // one-time scrub — see docstring
      const id = t.id || `${t.type}:${t.name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      restored.push({ id, type: t.type, name: t.name, dirty: false });
    }
    set({ workspaceTabs: restored });
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

  /**
   * Focus a tab by id without opening anything new. No-op if id unknown.
   * Navigates the URL AND activates in the store synchronously — see
   * `openWorkspaceTab`'s comment for the full VIS-1050 rationale (don't
   * depend entirely on the separate, racy URL→store sync effect).
   */
  switchWorkspaceTab: (tabId) => {
    const state = get();
    const tab = state.workspaceTabs.find((t) => t.id === tabId);
    if (!tab) return;
    // Route the selection through the URL (Back button + single loop).
    if (state.workspaceUrlNavigate) {
      state.workspaceUrlNavigate(workspaceTabUrl(tab, state.workspaceUrlBase));
    }
    state.activateWorkspaceTab(tab);
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
    const wasActive = state.workspaceActiveTabId === tabId;
    const newActive = wasActive && remaining.length ? remaining[Math.max(0, idx - 1)] : null;
    let activeId = state.workspaceActiveTabId;
    let activeObject = state.workspaceActiveObject;
    let activeView = state.workspaceActiveView;
    if (wasActive) {
      activeId = newActive ? newActive.id : null;
      activeObject = newActive ? { type: newActive.type, name: newActive.name } : null;
      // A remaining tab re-takes the center under ITS owning destination.
      // Closing the LAST tab leaves the view exactly where it was —
      // `workspaceActiveView` already holds the closed tab's destination, so
      // "closing a freshly deep-linked exploration returns you to Explorer
      // Home, not Project" (01-ux-spec.md §1) falls out for free.
      if (newActive) activeView = viewForDocumentType(newActive.type);
    }
    // Removing from the open set + shifting active is one store update (the
    // active id must never dangle at a removed tab). We set active here rather
    // than routing it through the URL, then sync the URL below so Back still
    // works — the URL sync re-confirms the same value (idempotent, no loop).
    set({
      workspaceTabs: remaining,
      workspaceActiveTabId: activeId,
      workspaceActiveObject: activeObject,
      workspaceActiveView: activeView,
      ...outlineKeyResetFor(state.workspaceActiveObject, activeObject),
      // A tab closed by any path can't stay parked in the confirm dialog.
      workspacePendingCloseTabId:
        state.workspacePendingCloseTabId === tabId ? null : state.workspacePendingCloseTabId,
    });
    // Sync the URL to the new active surface. A remaining tab routes to ITS
    // url (`?edit=...`/`/dashboard/:name`); closing the LAST tab leaves a VIEW
    // owning the center (`activeView`, already resolved above), so we route
    // to THAT view's url instead of leaving the closed tab's `?edit=`/
    // dashboard path dangling in the address bar. Phase 0 removed the
    // "navigating to /workspace resurrects the project tab" concern this used
    // to guard against (views are no longer tab records — `activateWorkspaceView`
    // never hydrates a tab) — and a dangling `?edit=` was actively harmful:
    // `useWorkspaceScope`'s `?edit=` fallback (used once no tab is active)
    // kept resolving the CLOSED document as the selection, so the right rail
    // kept rendering its Edit tab and `[role="tab"]` never reached 0.
    if (wasActive && state.workspaceUrlNavigate) {
      if (newActive) {
        state.workspaceUrlNavigate(workspaceTabUrl(newActive, state.workspaceUrlBase));
      } else {
        state.workspaceUrlNavigate(workspaceViewUrl(activeView, state.workspaceUrlBase));
      }
    }
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

  /**
   * Confirm the pending dirty close — closes the tab and clears the pending
   * id. VIS-1081: for an `exploration` tab specifically, this is "Close
   * without saving"'s ONLY chance to make that promise true — an exploration
   * autosaves in the background while its tab is open, so closing it
   * through the generic path alone would let the very edits the dialog just
   * offered to discard finish persisting moments later anyway. `discardExploration`
   * (workspaceExplorationsStore.js) reverts to the tab-open snapshot FIRST;
   * best-effort — a failed/absent discard never blocks the close.
   */
  confirmCloseWorkspaceTab: () => {
    const state = get();
    const tabId = state.workspacePendingCloseTabId;
    if (!tabId) return;
    set({ workspacePendingCloseTabId: null });
    const tab = state.workspaceTabs.find((t) => t.id === tabId);
    if (tab?.type === 'exploration' && tabId.startsWith('exploration:')) {
      const explorationId = tabId.slice('exploration:'.length);
      state.discardExploration?.(explorationId);
    }
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
   * The unified selection action (VIS-994; subsumes the old VIS-976/977/978/984
   * split-write bugs by construction). Atomically selects an active object
   * (library/canvas/tab) and/or an outline-tree key (dashboard structure), and
   * optionally reveals the right-rail Edit panel in the same write. Either
   * selection argument can be null to clear that half. Use this instead of
   * separate `setWorkspaceOutlineSelectedKey` + `workspaceActiveObject` updates
   * to avoid split-render glitches.
   *
   * Deliberately NOT owned here:
   *   - `workspaceLensIntent` — producers set it one statement before the
   *     selection change that consumes it, and `ObjectCanvasFrame` self-clears
   *     it; a blanket clear-on-selection would break Lineage-on-open.
   *   - `workspacePivotDraft` — component-lifecycle managed by PivotPlayground.
   *
   * @param {{ type: string, name: string }|null} activeObject - the object, or null to clear; undefined keeps the current object.
   * @param {string|null} outlineKey - outline key (e.g. 'dashboard', 'row.0', 'row.0.item.1'); null resets to the 'dashboard' default, undefined keeps the existing key.
   * @param {{ revealEdit?: boolean }} [options] - `revealEdit: true` switches the
   *   right rail to the Edit tab AND un-collapses the rail (VIS-977: canvas
   *   click must surface the editor, not just move the selection ring).
   */
  setWorkspaceSelection: (activeObject, outlineKey, { revealEdit = false } = {}) => {
    const update = {};
    const prevObject = get().workspaceActiveObject;

    // Update active object if explicitly passed (including null to clear)
    if (activeObject !== undefined) {
      update.workspaceActiveObject = activeObject;
    }

    // Update outline key if provided and valid
    if (outlineKey !== undefined && outlineKey !== null) {
      if (typeof outlineKey === 'string' && outlineKey) {
        update.workspaceOutlineSelectedKey = outlineKey;
      }
    } else if (outlineKey === null) {
      // null explicitly clears / resets to 'dashboard'
      update.workspaceOutlineSelectedKey = 'dashboard';
    } else if (activeObject !== undefined) {
      // outlineKey left undefined: keep the key when re-selecting the SAME object,
      // but reset it when the object CHANGES. A 'row.N.item.M' key is scoped to
      // one dashboard's structure and renders "Row not found" placeholders if
      // carried onto a different object (VIS-978) — the same stale-key invariant
      // the tab actions enforce, which this unified action is documented to own.
      Object.assign(update, outlineKeyResetFor(prevObject, activeObject));
    }

    if (revealEdit) {
      update.workspaceRightTab = 'edit';
      update.workspaceRightCollapsed = false;
    }

    if (Object.keys(update).length > 0) {
      set(update);
    }
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
    const nextEntry = withConfig(entry, nextConfig);
    const nextList = [...list];
    nextList[idx] = nextEntry;
    set({ dashboards: nextList });
    return true;
  },

  /**
   * Generic, type-keyed sibling of `updateDashboardConfigOptimistic`
   * (VIS-1018 step 1). Optimistically replace a record's draft config in its
   * store collection WITHOUT persisting, for ANY object type. This is the
   * in-memory half of the unified `useRecordSave` backbone: every open editing
   * surface writes here immediately so the canvas, Outline, and the form's own
   * widgets converge on the latest edit before the debounced persist fires.
   *
   * The collection for a type comes from the shared `COLLECTION_KEY` map, and
   * the envelope-vs-bare entry shape is handled by `withConfig`, so this and
   * the dashboard-specific action can never drift. `dashboard` delegates to
   * `updateDashboardConfigOptimistic` so its row-selection side effects (and
   * any future dashboard-only behaviour) stay in one place.
   *
   * @returns {boolean} `true` on a write, `false` for an unknown type/name or a
   *          record that isn't in the collection.
   */
  updateRecordConfigOptimistic: (type, name, nextConfig) => {
    if (!type || !name) return false;
    if (type === 'dashboard') {
      return get().updateDashboardConfigOptimistic(name, nextConfig);
    }
    const collectionKey = COLLECTION_KEY[type];
    if (!collectionKey) return false;
    const state = get();
    const list = state[collectionKey] || [];
    const idx = list.findIndex((r) => r.name === name);
    if (idx === -1) return false;
    const entry = list[idx];
    const nextList = [...list];
    nextList[idx] = withConfig(entry, nextConfig);
    set({ [collectionKey]: nextList });
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
    const config = unwrapConfig(entry);
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const newRow = { height: 'medium', items: [] };
    const nextRows = [...rows, newRow];
    const nextConfig = { ...config, rows: nextRows };

    const nextEntry = withConfig(entry, nextConfig);
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
    const activeObject = activeTab ? { type: activeTab.type, name: activeTab.name } : null;
    set({
      workspaceTabs: safeTabs,
      workspaceActiveTabId: activeId,
      workspaceActiveObject: activeObject,
      ...outlineKeyResetFor(get().workspaceActiveObject, activeObject),
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
