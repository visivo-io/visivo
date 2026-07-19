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
 *
 * WRITE SERIALIZATION (VIS-1085, extended by the Phase 4 delta P4-D1): every
 * write that touches a given exploration's on-disk JSON document — the
 * debounced draft sync (`runSync`), an immediate rename (`renameExploration`),
 * a discard revert (`discardExploration`), AND an append-only promotion
 * record (`recordExplorationPromotion`) — is enqueued onto a per-id promise
 * chain (`_writeQueues`/`enqueueWrite`) rather than fired directly. The first
 * three go through the backend's generic `ExplorationRepository.update()`;
 * `recordExplorationPromotion` goes through the separate `record_promotion()`
 * method — but BOTH are unlocked read-modify-writes on the exact same file
 * (full `_read()` -> patch -> `_write()`, no lock, no version check), so two
 * of ANY of these four requests landing concurrently for the SAME id — e.g. a
 * rename firing the instant the draft-sync debounce also fires, or a
 * keyboard-shortcut tab switch mid-promote unmounting `ExplorationPane` and
 * firing its flush-on-deactivate while `promoteExploration`'s own
 * `recordExplorationPromotion` call is still in flight — can each `_read()`
 * before either `_write()` lands, so whichever writes last silently clobbers
 * the other's field (including wiping a just-appended `promoted[]` entry).
 * Serializing on the CLIENT guarantees at most one write for a given id is
 * ever in flight, closing the race without needing any backend locking.
 * `useWorkspaceTabShortcuts.js`'s `hasBlockingModal` guard closes the other
 * half of P4-D1: it stops the keyboard-driven unmount from happening AT ALL
 * while `ExplorationPromoteModal` (or any other blocking modal) is open, so
 * the race this queue defends against becomes unreachable via that path,
 * not just survivable.
 *
 * DELETED REMOTELY (VIS-1083): a 404 from `update()` means the record was
 * removed out from under this session (another tab/session's delete, or an
 * out-of-band `rm .visivo/explorations/<id>.json`) — see `runSync`'s catch
 * and `recreateExplorationFromDeleted`/`discardDeletedExploration` below for
 * how the slice stops silently retrying forever and instead surfaces a
 * recoverable state (`syncStatus: 'deleted-remotely'`).
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
import { emitWorkspaceEvent, markExplorationCreated } from '../components/views/workspace/telemetry';

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

// VIS-1085: id -> the tail of that id's serialized-write promise chain. Every
// `explorationsApi.updateExploration` call for a given id is enqueued here
// (`enqueueWrite`) so the debounced draft sync, an immediate rename, and a
// discard revert never race each other against the backend's unlocked
// read-modify-write. Module-level for the same reason `_pendingSyncTimers`
// is — ephemeral, per-record bookkeeping, not reactive state.
const _writeQueues = new Map();

/** Test-only: clear all write queues so state doesn't leak across test files. */
export const _resetExplorationWriteQueuesForTests = () => {
  _writeQueues.clear();
};

/** Run `task` after every currently-queued write for `id` has settled
 * (success or failure — one write's failure must never wedge the next write
 * behind it forever), and become the new tail of that chain. */
const enqueueWrite = (id, task) => {
  const previous = _writeQueues.get(id) || Promise.resolve();
  const next = previous.then(task, task);
  // The tail stored for the NEXT enqueue must never be a rejected promise
  // (an unhandled rejection on a value nothing else awaits) — callers still
  // observe the real outcome via the `next` this function returns.
  _writeQueues.set(id, next.catch(() => {}));
  return next;
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
      // VIS-1085: enqueued (not fired directly) so this can never interleave
      // with a concurrent rename/discard-revert write for the SAME id.
      const updated = await enqueueWrite(id, () =>
        explorationsApi.updateExploration(id, { draft: mapDraftToApi(record.draft) })
      );
      set(state =>
        patchExploration(state, id, {
          draft: mapDraftFromApi(updated.draft),
          updatedAt: updated.updated_at,
          syncStatus: 'synced',
        })
      );
      return { success: true };
    } catch (error) {
      // VIS-1083: a 404 means the record is gone (deleted from another
      // session, or removed out-of-band) — the update() route will 404
      // forever, so retrying (as every subsequent keystroke otherwise would,
      // via updateExplorationDraft re-arming scheduleSync) is pointless and
      // silent. Stop here with a distinct, recoverable status instead of the
      // generic 'error' — `updateExplorationDraft` below checks for it and
      // stops re-arming the sync loop; the UI (ExplorationPane) surfaces a
      // banner with real options (recreate / close) rather than nothing.
      if (error?.status === 404) {
        set(state => patchExploration(state, id, { syncStatus: 'deleted-remotely' }));
        return { success: false, error: error.message, deletedRemotely: true };
      }
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
     * (Phase 4/5) via the existing `consumeReturnTo` endpoint.
     *
     * `legacyStateOverride` (optional, Explore 2.0 Phase 5 — VIS-1067) lets a
     * caller hand in a fully-built legacy working-state snapshot (see
     * `explorerStore.js`'s `buildExplorationSeedState`) instead of relying on
     * `legacyStateForSeed`'s `type === 'source'`-only bridge — the "Explore
     * this" context-menu action's pre-wired query for models/tables and its
     * name-preserving copy for insights/charts both go through this. */
    createExploration: async (seed = null, returnTo = null, legacyStateOverride = null) => {
      try {
        const payload = seed ? { seeded_from: seed } : {};
        if (returnTo) payload.return_to = returnTo;
        const seedLegacyState = legacyStateOverride || (seed ? legacyStateForSeed(seed) : null);
        if (seedLegacyState) payload.draft = mapDraftToApi(legacyStateToDraft(seedLegacyState));
        const created = await explorationsApi.createExploration(payload);
        const mapped = mapExplorationFromApi(created);
        set(state => insertExploration(state, mapped));
        // VIS-1072 — flywheel telemetry: the create moment + the
        // time_to_first_chart clock start together.
        markExplorationCreated(mapped.id);
        emitWorkspaceEvent('exploration_created', {
          seededFromType: seed?.type || null,
          hasReturnTo: !!returnTo,
        });
        return { success: true, id: mapped.id, exploration: mapped };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /** Optimistically replace `id`'s draft and debounce-persist it. */
    updateExplorationDraft: (id, nextDraft) => {
      const existing = get().workspaceExplorations.byId[id];
      if (!existing) return;
      // VIS-1083: once the backend has told us this record is gone (a prior
      // sync 404'd), never re-arm the sync loop — every further keystroke
      // would otherwise schedule another doomed POST forever, silently
      // failing on repeat with no way out. Keep the local edit (nothing is
      // lost while the user decides what to do) but stop trying to persist
      // it until they act on the banner (recreate / close).
      if (existing.syncStatus === 'deleted-remotely') {
        set(state => patchExploration(state, id, { draft: nextDraft }));
        return;
      }
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
        // VIS-1072 — "branch" gets its own time_to_first_chart clock too,
        // same as a fresh create (the copy's own draft may still need its
        // first successful preview render, even though the SOURCE
        // exploration already had one).
        markExplorationCreated(mapped.id);
        emitWorkspaceEvent('exploration_branched', { sourceId: id });
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

    /**
     * VIS-1083 — "Recreate as new exploration" option on the
     * deleted-remotely banner (`ExplorationPane`/`ExplorationDeletedRemotelyBanner`):
     * the backend record for `id` is confirmed gone (a prior sync 404'd), but
     * this session's local draft — everything typed since the last
     * successful sync — is still sitting in `workspaceExplorations.byId[id]`.
     * Mints a BRAND NEW exploration seeded from that local draft (never
     * retries the dead id — it will 404 forever), drops the dead local
     * record, force-closes its tab, and opens the new one in its place.
     */
    recreateExplorationFromDeleted: async id => {
      const existing = get().workspaceExplorations.byId[id];
      if (!existing) return { success: false, error: 'Exploration not found' };
      try {
        const created = await explorationsApi.createExploration({
          name: existing.name,
          seeded_from: existing.seededFrom || undefined,
          draft: mapDraftToApi(existing.draft),
        });
        const mapped = mapExplorationFromApi(created);
        set(state => insertExploration(state, mapped));
        clearPendingSyncTimer(id);
        _writeQueues.delete(id);
        const tabId = `exploration:${id}`;
        get().closeWorkspaceTab?.(tabId);
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
        get().openWorkspaceTab?.({
          id: `exploration:${mapped.id}`,
          type: 'exploration',
          name: mapped.id,
        });
        return { success: true, id: mapped.id, exploration: mapped };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /** VIS-1083 — "Close" option on the deleted-remotely banner: the backend
     * record is already gone, so there's nothing left to persist or lose —
     * just drop the dead local record and force-close its tab (no confirm
     * dialog; a 404'd record can't have a meaningful "unsaved changes"
     * guarantee to honor). */
    discardDeletedExploration: id => {
      clearPendingSyncTimer(id);
      _writeQueues.delete(id);
      const tabId = `exploration:${id}`;
      get().closeWorkspaceTab?.(tabId);
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
        // VIS-1085: enqueued so a rename landing in the same window as the
        // debounced draft-sync can never interleave with it — see the file
        // docstring's "WRITE SERIALIZATION" note.
        const updated = await enqueueWrite(id, () =>
          explorationsApi.updateExploration(id, { name: trimmed })
        );
        const mapped = mapExplorationFromApi(updated);
        set(state => patchExploration(state, id, mapped));
        return { success: true, exploration: mapped };
      } catch (error) {
        if (error?.status === 404) {
          set(state => patchExploration(state, id, { syncStatus: 'deleted-remotely' }));
          return { success: false, error: error.message, deletedRemotely: true };
        }
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
     *
     * Phase 4 delta (P4-D4) — "ghost trail" fix: the discard SNAPSHOT is
     * `draft`-only (`snapshotExplorationForDiscard`, above) and the revert
     * POST's payload is deliberately `{ draft }` alone — `name`/`return_to`
     * are never part of this operation, and `promoted[]` is immutable via
     * the generic update route on the BACKEND regardless of payload (see
     * `exploration_repository.py`'s `update()`/`TestImmutability`). So a
     * partial-promote-then-discard can never have this call's OWN payload
     * erase a promotion. The remaining risk was staleness, not payload
     * shape: `update()` is a `_read()` -> patch -> `_write()`-the-FULL-
     * document round trip, so if this revert's `_read()` landed before a
     * concurrent `recordExplorationPromotion` write, this call's OWN
     * `_write()` could persist a document based on that stale read —
     * silently reverting the just-appended promotion even though this
     * payload never mentioned it. `enqueueWrite` below closes that (both
     * writers for one id are now strictly serialized — see the file
     * docstring), so on success this always reflects the CURRENT server
     * document, INCLUDING any promotion recorded ahead of it in the queue —
     * applied back into local state so the Build-rail promoted trail
     * (`ExplorationBuildRail.jsx`) never lags behind server truth after a
     * discard. `draft` is deliberately excluded from that merge — the
     * snapshot already reverted above IS the authoritative post-discard
     * draft (byte-identical to what this POST just echoed back).
     */
    discardExploration: async id => {
      clearPendingSyncTimer(id);
      const snapshot = _openDraftSnapshots.get(id);
      if (snapshot === undefined) return { success: true, reverted: false };
      _openDraftSnapshots.delete(id);
      // VIS-1072 — fired once we know a real revert is happening (never for
      // the no-op "discard invoked before the pane ever activated" case
      // above, which returned early).
      emitWorkspaceEvent('exploration_discarded', { id });

      set(state => patchExploration(state, id, { draft: snapshot, syncStatus: 'synced' }));
      get().restoreExplorerWorkingState?.(draftToLegacyState(snapshot));

      try {
        // VIS-1085: enqueued alongside every other write for this id — see
        // the file docstring's "WRITE SERIALIZATION" note.
        const updated = await enqueueWrite(id, () =>
          explorationsApi.updateExploration(id, { draft: mapDraftToApi(snapshot) })
        );
        const mapped = mapExplorationFromApi(updated);
        set(state => patchExploration(state, id, { promoted: mapped.promoted, updatedAt: mapped.updatedAt }));
        return { success: true, reverted: true };
      } catch (error) {
        // A 404 here just means the record was ALSO deleted remotely in the
        // same window — the tab is closing regardless (discard is
        // best-effort, per the docstring above), so there's nothing further
        // to surface; the record is gone either way.
        return { success: false, reverted: true, error: error.message };
      }
    },

    /**
     * consumeExplorationReturnTo(id) — VIS-1068 dashboard round-trip
     * completion. Calls the consume-return-to endpoint (server nulls
     * `return_to`, idempotently) and mirrors the result into the local
     * record. Enqueued alongside every other write for this id (draft sync /
     * rename / discard revert / record-promotion) — see the file docstring's
     * "WRITE SERIALIZATION" note; consuming return_to is one more unlocked
     * read-modify-write against the same on-disk document.
     *
     * Called BOTH when the user accepts "Place in <dashboard>" (after the
     * chart has actually been placed) and when they decline it (01-ux-spec.md
     * §5: "Declining also consumes — explicit choice, no accretion").
     */
    consumeExplorationReturnTo: async id => {
      try {
        const updated = await enqueueWrite(id, () => explorationsApi.consumeReturnTo(id));
        const mapped = mapExplorationFromApi(updated);
        set(state => patchExploration(state, id, { returnTo: mapped.returnTo }));
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /** Append-only promotion record (07-exploration-api-contract.md's
     * record-promotion sub-action) — call after a `saveX` action succeeds
     * for a promoted object.
     *
     * Phase 4 delta (P4-D1): enqueued alongside every other write for this
     * id (draft sync / rename / discard revert). `record_promotion()`
     * (exploration_repository.py) is a SEPARATE backend method from the
     * generic `update()` route, but reads and rewrites the exact same
     * on-disk JSON document with the exact same unlocked read-modify-write
     * shape — so it needs the same client-side serialization to stay safe
     * against a concurrent `update()` write for this id (e.g. a keyboard
     * shortcut mid-`promoteExploration` unmounting `ExplorationPane`, whose
     * deactivate cleanup fires a draft-sync flush). Without this, whichever
     * write's `_read()` happened first can have its `_write()` land last and
     * silently clobber the other's persisted field, INCLUDING wiping the
     * just-appended `promoted[]` entry this call exists to record. */
    recordExplorationPromotion: async (id, type, name) => {
      try {
        const updated = await enqueueWrite(id, () => explorationsApi.recordPromotion(id, type, name));
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

      // VIS-1072 — `object_counts` (per-type, successful promotions only) +
      // `update_vs_new` (status is carried on the CHECKLIST row, not the
      // result — re-key `toPromote` by "type:name" to look it up per
      // successful result without a second buildPromoteChecklist pass).
      const rowByKey = new Map(toPromote.map(row => [`${row.type}:${row.name}`, row]));
      const objectCounts = {};
      const updateVsNew = { updated: 0, new: 0 };
      results
        .filter(r => r.success)
        .forEach(r => {
          objectCounts[r.type] = (objectCounts[r.type] || 0) + 1;
          const row = rowByKey.get(`${r.type}:${r.name}`);
          if (row?.status === 'modified') updateVsNew.updated += 1;
          else updateVsNew.new += 1;
        });
      if (results.length > 0) {
        emitWorkspaceEvent('exploration_promoted', {
          id,
          objectCounts,
          updateVsNew,
        });
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
