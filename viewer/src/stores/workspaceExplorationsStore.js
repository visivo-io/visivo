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
 * PROMOTE (Explore 2.0 Phase 4, 02-architecture.md §3): `promoteExploration`
 * dependency-orders a user-selected subset of `buildPromoteChecklist`'s rows
 * (models -> model-scoped fields -> insights -> chart), persists each through
 * the REAL per-type `saveX` store actions (never raw `api/*.js` calls —
 * refetch/checkCommitStatus/run-on-save/Library-refresh all need to fire),
 * and records each success on the exploration's append-only `promoted[]`
 * trail via `record-promotion`. A failed row blocks only itself.
 *
 * DISCARD (VIS-1081): `snapshotExplorationForDiscard`/`discardExploration`
 * implement TRUE discard for "Close without saving" on a dirty exploration
 * tab — see their docstrings below for why a naive close used to silently
 * re-persist the very draft the user asked to discard.
 */

import * as explorationsApi from '../api/explorations';
import {
  legacyStateForSeed,
  legacyStateToDraft,
  draftToLegacyState,
} from '../components/views/workspace/explorationLegacyBridge';
import { buildPromoteChecklist } from './promoteChecklist';
import { SAVE_ACTION } from '../components/views/workspace/collectionKeys';
import { findReclassifiedSlots } from '../components/views/common/pillFieldSwap';

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

// Exploration id -> the persisted `draft` (internal-slice shape) as of the
// moment the tab was last (re)activated (`snapshotExplorationForDiscard`).
// VIS-1081's discard target: "Close without saving" reverts to exactly this,
// not to whatever was persisted a moment ago. Module-level for the same
// reason `_pendingSyncTimers` is — ephemeral, non-serializable, per-record
// session bookkeeping, not reactive state.
export const _openDraftSnapshots = new Map();

/** Test-only: clear all open-draft snapshots so state doesn't leak across test files. */
export const _resetExplorationSnapshotsForTests = () => {
  _openDraftSnapshots.clear();
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
     * ref — `{ type, name }` — e.g. from an "Explore this" action. A
     * `{type: 'source', name}` seed also pre-wires one empty model tab to
     * that source (`legacyStateForSeed`, ExplorerHomePane's "Start from a
     * source" tiles, 01-ux-spec.md §2) so the SQL editor opens ready to
     * query it instead of blank with no source selected.
     *
     * `returnTo` (optional, Explore 2.0 Phase 3b cutover — 02-architecture.md
     * §5) is a one-shot placement intent `{ dashboard, slot? }`: the
     * `/workspace/dashboard/:name/explorer` composed route mints a fresh
     * exploration carrying it so "Place in <dashboard>" can consume it later
     * (Phase 4/5) via the existing `consumeReturnTo` endpoint. */
    createExploration: async (seed = null, returnTo = null) => {
      try {
        const payload = seed ? { seeded_from: seed } : {};
        if (returnTo) payload.return_to = returnTo;
        const seedLegacyState = seed ? legacyStateForSeed(seed) : null;
        if (seedLegacyState) payload.draft = mapDraftToApi(legacyStateToDraft(seedLegacyState));
        const created = await explorationsApi.createExploration(payload);
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

    /** VIS-1081 — call from the exploration pane's activate effect (mount, or
     * `id` changing), alongside `restoreExplorerWorkingState`. Captures the
     * CURRENT persisted draft as the "opening snapshot" a later
     * `discardExploration` reverts to. Re-snapshotting on every activation
     * (not just the first ever) is deliberate: re-opening a parked
     * exploration starts a NEW editing session, and the prior session's own
     * deactivate-flush already persisted its edits — this session's discard
     * target is that just-persisted state, not some earlier one. */
    snapshotExplorationForDiscard: id => {
      const record = get().workspaceExplorations.byId[id];
      if (!record) return;
      _openDraftSnapshots.set(id, record.draft);
    },

    /** VIS-1081 — cleanup counterpart, call from the pane's deactivate
     * cleanup on a NORMAL (non-discard) close/switch. `discardExploration`
     * clears its own entry; this just avoids leaking one for the (much more
     * common) lossless-park path. */
    clearExplorationDiscardSnapshot: id => {
      _openDraftSnapshots.delete(id);
    },

    /**
     * VIS-1081 — true discard for "Close without saving" on a dirty
     * exploration tab.
     *
     * THE BUG: an exploration autosaves via a ~1s debounce while its tab is
     * open (`updateExplorationDraft`/`ExplorationPane`'s live-sync effect) —
     * the tab's dirty dot is driven by `syncStatus === 'saving'`, i.e. it is
     * ONLY ever dirty while a sync is armed or in flight. `TabCloseConfirmDialog`
     * ("Close without saving") used to just call the generic
     * `closeWorkspaceTab`, which neither cancels that armed timer nor reverts
     * anything — so the very edits the dialog promised to discard would
     * finish persisting moments later regardless, a silently broken promise.
     *
     * THE FIX (chosen per the S2/VIS-1081 brief's option (b) — true discard,
     * since it fits cleanly atop the existing record model: a revert IS just
     * one POST update with the opening snapshot):
     *   1. Cancel any pending debounced sync — nothing further leaks out.
     *   2. Revert the LOCAL slice record's draft to the opening snapshot
     *      (`snapshotExplorationForDiscard`, captured at tab-open) and POST
     *      that same snapshot back to the backend, so the persisted record
     *      matches what the user saw when they opened this session.
     *   3. Reset the legacy `explorerStore.js` WORKING STATE to the same
     *      snapshot — required because `ExplorationPane`'s own unmount
     *      cleanup (which fires right after this, as part of the SAME
     *      `closeWorkspaceTab` React commit) unconditionally re-snapshots
     *      whatever the legacy store currently holds and re-persists it. If
     *      step 3 didn't happen, that cleanup would silently re-apply the
     *      discarded edits on top of this revert.
     *
     * Best-effort: a missing snapshot (discard invoked before the pane ever
     * activated) or a failed revert POST never blocks the tab from closing —
     * "Close without saving" always closes; the discard itself degrades
     * gracefully.
     */
    discardExploration: async id => {
      clearPendingSyncTimer(id);
      const snapshot = _openDraftSnapshots.get(id);
      if (snapshot === undefined) return { success: true, reverted: false };
      _openDraftSnapshots.delete(id);

      set(state => patchExploration(state, id, { draft: snapshot, syncStatus: 'synced' }));
      get().restoreExplorerWorkingState?.(draftToLegacyState(snapshot));

      try {
        await explorationsApi.updateExploration(id, { draft: mapDraftToApi(snapshot) });
        return { success: true, reverted: true };
      } catch (error) {
        return { success: false, reverted: true, error: error.message };
      }
    },

    /** Append-only promotion record (07-exploration-api-contract.md's
     * record-promotion sub-action) — call after a `saveX` action succeeds
     * for a promoted object. */
    recordExplorationPromotion: async (id, type, name) => {
      try {
        const updated = await explorationsApi.recordPromotion(id, type, name);
        const mapped = mapExplorationFromApi(updated);
        set(state => patchExploration(state, id, mapped));
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /**
     * promoteExploration(id, selection) — the gated promote (02-architecture.md
     * §3, 01-ux-spec.md §3's "Save to Project" checklist).
     *
     * `selection`: `Array<{type, name}>` — the checklist rows the user
     * checked (typically every currently-valid row, per the "all valid
     * objects pre-checked" default). Recomputes `buildPromoteChecklist`
     * FRESH here (never trusts whatever the checklist UI rendered a moment
     * ago — "Fresh get() per object"), filters to selected+valid rows, and
     * persists them in dependency order through the real per-type `saveX`
     * store actions (update-by-name is intrinsic to those actions — a draft
     * seeded from an existing object keeps its name, so promoting it simply
     * updates the original; no special-casing needed).
     *
     * A row's save failure blocks ONLY that row — the loop continues so
     * partial promotion (01 §3) is normal. After each successful
     * metric/dimension promotion, scans the draft for OTHER slots whose bare
     * column ref now collides with the newly-promoted name (the backend's
     * verified "global-name-first" ref resolution silently reclassifies
     * them, delta-review finding) and returns them as explicit
     * `reclassificationOffers` — never a silent rendering change.
     *
     * @returns {Promise<{
     *   success: boolean,
     *   results: Array<{type, name, tier, success: boolean, error: string|null}>,
     *   reclassificationOffers: Array<{promotedType, promotedName, slots}>,
     * }>}
     */
    promoteExploration: async (id, selection) => {
      const selectedKeys = new Set((selection || []).map(s => `${s.type}:${s.name}`));
      const checklist = await buildPromoteChecklist(get);
      // Re-sort by tier defensively — dependency order is THE invariant this
      // gate exists to guarantee (02 §3), so it must not silently depend on
      // buildPromoteChecklist's own sort never regressing.
      const tierOrder = { model: 0, field: 1, insight: 2, chart: 3 };
      const toPromote = checklist
        .filter(row => row.valid && selectedKeys.has(`${row.type}:${row.name}`))
        .sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

      const results = [];
      const reclassificationOffers = [];

      for (const row of toPromote) {
        const saveActionName = SAVE_ACTION[row.type];
        const saveFn = saveActionName ? get()[saveActionName] : null;
        if (typeof saveFn !== 'function') {
          results.push({
            type: row.type,
            name: row.name,
            tier: row.tier,
            success: false,
            error: `No save action registered for type "${row.type}"`,
          });
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const saveResult = await saveFn(row.name, row.config);
        const saveSucceeded = !(saveResult && saveResult.success === false);
        results.push({
          type: row.type,
          name: row.name,
          tier: row.tier,
          success: saveSucceeded,
          error: saveSucceeded ? null : saveResult?.error || 'Save failed',
        });
        if (!saveSucceeded) continue;

        // eslint-disable-next-line no-await-in-loop
        await get().recordExplorationPromotion?.(id, row.type, row.name);

        if (row.type === 'metric' || row.type === 'dimension') {
          const hits = findReclassifiedSlots(
            row.name,
            row.type,
            get().explorerInsightStates || {}
          );
          if (hits.length > 0) {
            reclassificationOffers.push({
              promotedType: row.type,
              promotedName: row.name,
              slots: hits,
            });
          }
        }
      }

      return {
        success: results.length > 0 && results.every(r => r.success),
        results,
        reclassificationOffers,
      };
    },
  };
};

export default createWorkspaceExplorationsSlice;
