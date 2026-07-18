/**
 * Workspace Explorations Store Slice (Explore 2.0 Phase 1 — backend + slice,
 * no visible UI yet; see specs/plan/explorer-workspace-unification/).
 *
 * Keyed collection of Exploration records, synced against the Flask/Django
 * `/api/explorations/` S3 contract
 * (specs/plan/explorer-workspace-unification/07-exploration-api-contract.md):
 *
 *   workspaceExplorations: {
 *     byId: { 'exp_a1': { id, name, createdAt, updatedAt, seededFrom, returnTo,
 *                          promoted[], draft: { queries[], insights[], chart,
 *                          computedColumns[] }, syncStatus, staleness } },
 *     order: [...],   // Home listing order (recency) — server list order.
 *   }
 *
 * Draft edits touch ONLY this slice — never the shared per-type collections —
 * so exploratory typing can never clobber project state or fire a run (the
 * Flask routes are deliberately excluded from run_views.RESOURCE_META).
 *
 * DEBOUNCED SYNC: `updateExplorationDraft` writes the new draft into the
 * slice immediately (optimistic), then debounces (~1s) the persist. The
 * debounce timer is bookkept in a module-level Map (`_pendingSyncTimers`) —
 * not reactive state — because Zustand state is global while the "is a save
 * armed for this record" fact is really per-record, ephemeral, non-serializable
 * bookkeeping (mirrors `save_run_executor.py`'s module-level pending-timer
 * globals on the backend).
 *
 * FLUSH-ON-UNMOUNT: `flushExplorationSync(id)` is the primitive a future
 * exploration-editing component calls from its unmount cleanup — mirroring
 * `useRecordSave.js:245-256` / `useDebouncedSave.js:81-99`'s "flush a still-
 * armed debounced save on unmount rather than dropping the edit" convention.
 * It only fires a network request when a timer was actually armed (a clean
 * record unmounting is a no-op), and is safe to call without awaiting.
 *
 * PROMOTION IS OUT OF SCOPE for Phase 1 (arrives in Phase 4, 03-delivery-
 * plan.md) — there is no `promoteExploration` here.
 */

import * as explorationsApi from '../api/explorations';

const SYNC_DEBOUNCE_MS = 1000;

// Exploration id -> setTimeout handle for an armed-but-not-yet-fired debounced
// sync. Deliberately module-level (outside the Zustand store) — see the
// FLUSH-ON-UNMOUNT note above. Exported so tests can assert/flush/reset it.
export const _pendingSyncTimers = new Map();

/** Test-only: clear all armed timers so state doesn't leak across test files. */
export const _resetExplorationSyncTimersForTests = () => {
  _pendingSyncTimers.forEach(timer => clearTimeout(timer));
  _pendingSyncTimers.clear();
};

const clearPendingSyncTimer = id => {
  const timer = _pendingSyncTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    _pendingSyncTimers.delete(id);
  }
};

const mapDraftFromApi = draft => ({
  queries: draft?.queries || [],
  insights: draft?.insights || [],
  chart: draft?.chart ?? null,
  computedColumns: draft?.computed_columns || [],
  // The Phase 2 legacy-explorer-state escape hatch (02 §5 / exploration.py's
  // `legacy_state` field) — opaque here, mapped by `explorationLegacyBridge.js`.
  legacyState: draft?.legacy_state ?? null,
});

const mapDraftToApi = draft => ({
  queries: draft?.queries || [],
  insights: draft?.insights || [],
  chart: draft?.chart ?? null,
  computed_columns: draft?.computedColumns || [],
  legacy_state: draft?.legacyState ?? null,
});

const mapExplorationFromApi = record => ({
  id: record.id,
  name: record.name,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
  seededFrom: record.seeded_from ?? null,
  returnTo: record.return_to ?? null,
  draft: mapDraftFromApi(record.draft),
  promoted: record.promoted || [],
  // Just fetched/created/persisted — the store mirrors the server exactly.
  syncStatus: 'synced',
  // Staleness detection (re-run-to-refresh banner) is Phase 5 scope; the field
  // is reserved on the record now so later phases don't need a shape migration.
  staleness: null,
});

const insertExploration = (state, mapped) => ({
  workspaceExplorations: {
    byId: { ...state.workspaceExplorations.byId, [mapped.id]: mapped },
    // Newest-first, matching the server's `updated_at desc` list order.
    order: [mapped.id, ...state.workspaceExplorations.order.filter(id => id !== mapped.id)],
  },
});

const patchExploration = (state, id, patch) => {
  const existing = state.workspaceExplorations.byId[id];
  if (!existing) return state;
  return {
    workspaceExplorations: {
      ...state.workspaceExplorations,
      byId: {
        ...state.workspaceExplorations.byId,
        [id]: { ...existing, ...patch },
      },
    },
  };
};

const createWorkspaceExplorationsSlice = (set, get) => {
  /** Fire the debounced POST for `id`'s CURRENT draft (read at fire time —
   * not a captured closure — so a save always persists the latest edit). */
  const runSync = async id => {
    clearPendingSyncTimer(id);
    const record = get().workspaceExplorations.byId[id];
    if (!record) return { success: false };
    set(state => patchExploration(state, id, { syncStatus: 'saving' }));
    try {
      // `record` was read at the top of runSync (fire time), which — thanks to
      // scheduleSync always clearing/re-arming a single timer per id — already
      // reflects the LATEST optimistic draft, not a stale scheduling-time one.
      const updated = await explorationsApi.updateExploration(id, {
        draft: mapDraftToApi(record.draft),
      });
      set(state =>
        patchExploration(state, id, {
          draft: mapDraftFromApi(updated.draft),
          updatedAt: updated.updated_at,
          syncStatus: 'synced',
        })
      );
      return { success: true };
    } catch (error) {
      set(state => patchExploration(state, id, { syncStatus: 'error' }));
      return { success: false, error: error.message };
    }
  };

  const scheduleSync = id => {
    clearPendingSyncTimer(id);
    const timer = setTimeout(() => {
      _pendingSyncTimers.delete(id);
      runSync(id);
    }, SYNC_DEBOUNCE_MS);
    _pendingSyncTimers.set(id, timer);
  };

  return {
    workspaceExplorations: {
      byId: {},
      order: [],
    },

    // Explore 2.0 Phase 2: distinguishes "still loading" from "genuinely
    // unknown id" for `ExplorationPane`'s not-found state — an empty `byId`
    // is otherwise ambiguous (a fresh project with zero explorations is a
    // real, valid state; Explorer Home lazily seeds "Scratch" for it, but a
    // deep link can still land before that seed/fetch resolves). Flips to
    // `true` once `fetchExplorations` settles, success or failure alike.
    workspaceExplorationsFetched: false,

    /** Hydrate the slice from `GET /api/explorations/` (reload rehydrates
     * from the backend — localStorage is not a source of truth). */
    fetchExplorations: async () => {
      try {
        const list = await explorationsApi.fetchExplorations();
        const byId = {};
        const order = [];
        list.forEach(record => {
          const mapped = mapExplorationFromApi(record);
          byId[mapped.id] = mapped;
          order.push(mapped.id);
        });
        set({ workspaceExplorations: { byId, order }, workspaceExplorationsFetched: true });
        return { success: true };
      } catch (error) {
        set({ workspaceExplorationsFetched: true });
        return { success: false, error: error.message };
      }
    },

    /** Create a new exploration. `seed` (optional) is a durable provenance
     * ref — `{ type, name }` — e.g. from an "Explore this" action. */
    createExploration: async (seed = null) => {
      try {
        const created = await explorationsApi.createExploration(seed ? { seeded_from: seed } : {});
        const mapped = mapExplorationFromApi(created);
        set(state => insertExploration(state, mapped));
        return { success: true, id: mapped.id, exploration: mapped };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /** Optimistically replace `id`'s draft and debounce-persist it. */
    updateExplorationDraft: (id, nextDraft) => {
      const existing = get().workspaceExplorations.byId[id];
      if (!existing) return;
      set(state => patchExploration(state, id, { draft: nextDraft, syncStatus: 'saving' }));
      scheduleSync(id);
    },

    /** Flush a still-armed debounced sync immediately — call from an
     * exploration-editing component's unmount cleanup. A no-op (resolves
     * immediately) when nothing is pending. Safe to call without awaiting. */
    flushExplorationSync: async id => {
      if (!_pendingSyncTimers.has(id)) return { success: true, flushed: false };
      clearPendingSyncTimer(id);
      const result = await runSync(id);
      return { ...result, flushed: true };
    },

    /** Create a copy of `id` (same provenance + current draft, fresh id,
     * never carries over `return_to`/`promoted`). */
    duplicateExploration: async id => {
      const existing = get().workspaceExplorations.byId[id];
      if (!existing) return { success: false, error: 'Exploration not found' };
      try {
        const created = await explorationsApi.createExploration({
          name: `${existing.name} copy`,
          seeded_from: existing.seededFrom || undefined,
          draft: mapDraftToApi(existing.draft),
        });
        const mapped = mapExplorationFromApi(created);
        set(state => insertExploration(state, mapped));
        return { success: true, id: mapped.id, exploration: mapped };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /** Delete `id` — force-closes a bound open workspace tab (01 §4, EVEN
     * PARKED — `closeWorkspaceTab` doesn't care whether it's active) with a
     * toast ("<name> was deleted"), and drops any armed debounced sync so it
     * can't fire against a gone record. */
    deleteExploration: async id => {
      const existing = get().workspaceExplorations.byId[id];
      try {
        await explorationsApi.deleteExploration(id);
      } catch (error) {
        return { success: false, error: error.message };
      }
      clearPendingSyncTimer(id);
      const tabId = `exploration:${id}`;
      const wasOpen = (get().workspaceTabs || []).some(t => t.id === tabId);
      get().closeWorkspaceTab?.(tabId);
      if (wasOpen) {
        get().showWorkspaceToast?.(`${existing?.name || 'Exploration'} was deleted`);
      }
      set(state => {
        const nextById = { ...state.workspaceExplorations.byId };
        delete nextById[id];
        return {
          workspaceExplorations: {
            byId: nextById,
            order: state.workspaceExplorations.order.filter(existingId => existingId !== id),
          },
        };
      });
      return { success: true };
    },

    /** Rename `id` — persists immediately (not debounced; a rename is a
     * deliberate one-gesture commit, not exploratory typing) via the generic
     * update route (`name` is a mutable field, 07-exploration-api-contract.md).
     * Optimistic write first so the Home card / SubBar / tab label reflect the
     * new name instantly; rolls back on failure. */
    renameExploration: async (id, name) => {
      const existing = get().workspaceExplorations.byId[id];
      if (!existing) return { success: false, error: 'Exploration not found' };
      const trimmed = (name || '').trim();
      if (!trimmed || trimmed === existing.name) return { success: true, exploration: existing };
      const previousName = existing.name;
      set(state => patchExploration(state, id, { name: trimmed }));
      try {
        const updated = await explorationsApi.updateExploration(id, { name: trimmed });
        const mapped = mapExplorationFromApi(updated);
        set(state => patchExploration(state, id, mapped));
        return { success: true, exploration: mapped };
      } catch (error) {
        set(state => patchExploration(state, id, { name: previousName }));
        return { success: false, error: error.message };
      }
    },
  };
};

export default createWorkspaceExplorationsSlice;
