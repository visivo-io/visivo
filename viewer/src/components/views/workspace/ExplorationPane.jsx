import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { PiPencilSimple, PiCopy, PiCircleNotch } from 'react-icons/pi';
import useStore from '../../../stores/store';
import SubBar from './SubBar';
import ExplorationWorkbench from './ExplorationWorkbench';
import ExplorationDeletedRemotelyBanner from './ExplorationDeletedRemotelyBanner';
import ExplorationStalenessBanner from './ExplorationStalenessBanner';
import InlineRenameInput from './InlineRenameInput';
import useInlineRename from '../../../hooks/useInlineRename';
import { getTypeIcon, getTypeColors } from '../common/objectTypeConfigs';
import { legacyStateToDraft, draftToLegacyState } from './explorationLegacyBridge';
import { computeExplorationStaleness } from './explorationStaleness';
import { isExplorationVisibleInGallery } from './explorationLifecycle';
import CenteredFrameState from '../common/CenteredFrameState';
import { emitWorkspaceEvent } from './telemetry';

const ExplorationIcon = getTypeIcon('exploration');
const EXPLORATION_COLORS = getTypeColors('exploration');

// Debounce for the "still editing" persist — separate from (and shorter
// than) the slice's own ~1s backend-POST debounce (updateExplorationDraft
// already re-arms that internally on every call); this one just throttles
// how often we bother computing a snapshot from the legacy store at all.
const LIVE_SYNC_DEBOUNCE_MS = 600;

/**
 * RenameField — the SubBar's persistent-pencil rename affordance
 * (01-ux-spec.md §3's "⌕ Churn dig [rename]"), built on the shared
 * `InlineRenameInput`.
 */
const RenameField = ({ name, onCommit }) => {
  // B16 (04-bug-inventory.md): the shared "am I editing this name" toggle —
  // see useInlineRename's docstring for why this hook exists.
  const rename = useInlineRename({ onCommit });

  if (rename.editing) {
    return (
      <InlineRenameInput
        name={name}
        testIdPrefix="exploration-rename"
        onCommit={rename.commit}
        onCancel={rename.cancel}
      />
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate font-semibold text-gray-900">{name}</span>
      <button
        type="button"
        onClick={rename.start}
        title="Rename"
        aria-label="Rename exploration"
        data-testid="exploration-rename-start"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <PiPencilSimple style={{ fontSize: 12 }} />
      </button>
    </span>
  );
};

/**
 * ExplorationPane — the MiddlePane branch for a document tab of type
 * `exploration` (Explore 2.0 Phase 2). Explorations don't have a Library-row
 * collection to resolve through `ObjectCanvasFrame`/`useCanvasRecord`
 * (D5 — they mount outside the object-canvas registry entirely), so this
 * pane builds its own not-found/loading states explicitly and owns the
 * state-bridge lifecycle documented in `explorationLegacyBridge.js`:
 *
 *   - On activate (mount, or `id` changing to a different exploration): the
 *     legacy `explorerStore.js` singleton is fully RESET and rehydrated from
 *     this exploration's persisted `draft` (`restoreExplorerWorkingState`).
 *   - While active: a lightweight debounce watches the legacy working state
 *     and pushes a fresh draft via `updateExplorationDraft` (which itself
 *     re-arms the slice's own ~1s backend-persist debounce) — bounding data
 *     loss on a crash/hard-reload to ~1 debounce window (02-architecture.md
 *     §1/§8), and mirroring `syncStatus` onto the tab's dirty dot.
 *   - On deactivate (switching to a different tab, or navigating away
 *     entirely): the CURRENT legacy state is snapshotted and flushed
 *     synchronously (`flushExplorationSync`) before the next exploration (or
 *     nothing) claims the singleton — this is the two-tab isolation
 *     guarantee: only one exploration's state is ever "hot" in the legacy
 *     store at a time, and it's never handed off without being persisted
 *     first.
 *
 * `ExplorationWorkbench` (the center pane — SQL editor/results/chart preview;
 * the Insight+Chart CRUD rail moved OUT to the shell's `<RightRail>` at
 * 6c-T2, D6) is gated on the restore having landed for the CURRENT `id` —
 * mounting it one tick early would let `useExplorerWorkbenchInit`'s
 * "auto-create when empty" fire against a transient empty state that's about
 * to be overwritten.
 */
const ExplorationPane = ({ id }) => {
  const record = useStore(s => s.workspaceExplorations.byId[id]);
  const fetched = useStore(s => s.workspaceExplorationsFetched);
  const updateExplorationDraft = useStore(s => s.updateExplorationDraft);
  const flushExplorationSync = useStore(s => s.flushExplorationSync);
  const renameExploration = useStore(s => s.renameExploration);
  const duplicateExploration = useStore(s => s.duplicateExploration);
  const setWorkspaceTabDirty = useStore(s => s.setWorkspaceTabDirty);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const restoreExplorerWorkingState = useStore(s => s.restoreExplorerWorkingState);
  const snapshotExplorerWorkingState = useStore(s => s.snapshotExplorerWorkingState);
  // VIS-1081 (true discard): snapshot the persisted draft on every activate
  // so a later "Close without saving" has an honest revert target; clear the
  // bookkeeping on a normal deactivate (discardExploration clears it itself
  // on the discard path — see workspaceExplorationsStore.js).
  const snapshotExplorationForDiscard = useStore(s => s.snapshotExplorationForDiscard);
  const clearExplorationDiscardSnapshot = useStore(s => s.clearExplorationDiscardSnapshot);

  // The legacy working-state fields this pane watches to know "something
  // changed, go persist it" — the same set `explorerStore.js` snapshots.
  const explorerModelTabs = useStore(s => s.explorerModelTabs);
  const explorerModelStates = useStore(s => s.explorerModelStates);
  const explorerChartName = useStore(s => s.explorerChartName);
  const explorerChartLayout = useStore(s => s.explorerChartLayout);
  const explorerChartInsightNames = useStore(s => s.explorerChartInsightNames);
  const explorerInsightStates = useStore(s => s.explorerInsightStates);
  const explorerLeftNavCollapsed = useStore(s => s.explorerLeftNavCollapsed);
  const explorerCenterMode = useStore(s => s.explorerCenterMode);
  const explorerIsEditorCollapsed = useStore(s => s.explorerIsEditorCollapsed);

  const [readyId, setReadyId] = useState(null);
  const skipNextLiveSyncRef = useRef(false);
  // VIS-1070 — resume-time staleness (02-architecture.md §8): computed ONCE
  // per activation, not continuously (that's what the Build rail's own live
  // advisory validation already does while editing) — see
  // `explorationStaleness.js`'s docstring for what "stale" means here.
  const [staleness, setStaleness] = useState(null);
  const [stalenessDismissed, setStalenessDismissed] = useState(false);

  // Restore-on-activate / flush-on-deactivate. Deps are `[id, !!record]` —
  // NOT `record` itself: `record` is a fresh object on every optimistic
  // patch (every keystroke's debounced sync), and re-running this effect on
  // every patch would blow away in-progress edits by re-restoring from a
  // now-stale draft. `!!record` only flips false->true once (while the
  // exploration list loads), which is exactly the "the record just became
  // available, restore it" signal this needs.
  useLayoutEffect(() => {
    if (!record) return undefined;
    restoreExplorerWorkingState(draftToLegacyState(record.draft));
    // VIS-1081: capture THIS session's discard target — the draft exactly as
    // persisted at the moment we restored it above.
    snapshotExplorationForDiscard?.(id);
    // The restore above changes the exact fields the live-sync effect below
    // watches; that effect would otherwise immediately re-persist the
    // draft it just read. Not incorrect (idempotent), just wasted traffic.
    skipNextLiveSyncRef.current = true;
    setReadyId(id);
    // VIS-1070 — re-run ref checks against CURRENT collections right at
    // resume (a parked exploration may have sat while a referenced object
    // was deleted elsewhere). A fresh activation always gets a fresh check —
    // never carries over a previous session's dismissal.
    setStaleness(computeExplorationStaleness(record, useStore.getState()));
    setStalenessDismissed(false);
    // VIS-1072 — every activation (fresh create's immediate open, AND a
    // later resume of a parked tab) counts as "opened"; `exploration_created`
    // is the separate, narrower "minted a new record" signal.
    emitWorkspaceEvent('exploration_opened', { id });

    return () => {
      const snapshot = snapshotExplorerWorkingState();
      updateExplorationDraft(id, legacyStateToDraft(snapshot));
      flushExplorationSync(id);
      // Normal deactivate (park/switch) — nothing to discard, drop the
      // bookkeeping. A discard-triggered close already cleared this itself
      // (discardExploration) before this cleanup ever runs; deleting an
      // already-deleted map entry is a no-op.
      clearExplorationDiscardSnapshot?.(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!record]);

  // Mirror syncStatus -> the tab's dirty dot (01-ux-spec.md §1: "dirty dot
  // driven by the record's syncStatus ('saving' ⇒ dirty)"). Keyed on the
  // STATUS STRING, not the `record` object (which is a fresh reference on
  // every optimistic patch — every keystroke) — that would rebuild the
  // whole `workspaceTabs` array on every keystroke for no reason.
  const syncStatus = record?.syncStatus;
  useEffect(() => {
    if (syncStatus === undefined) return;
    setWorkspaceTabDirty(`exploration:${id}`, syncStatus === 'saving');
  }, [id, syncStatus, setWorkspaceTabDirty]);

  // Live debounced persist while the tab is open and being edited — bounds
  // data loss on a crash/hard-reload to ~1 debounce window (02 §1/§8).
  const liveSyncTimerRef = useRef(null);
  // Tracks whether THIS pane has a debounced write that hasn't fired yet —
  // distinct from `liveSyncTimerRef` itself, which (deliberately, so a
  // *new* edit's debounce can supersede an old one) holds the last timer ID
  // it ever set and is never nulled out when that timer fires naturally.
  // `flushNow` below needs the narrower "is something actually still
  // pending" signal, not "has this pane ever scheduled a sync" — see its
  // own comment for the regression this ref exists to prevent.
  const liveSyncPendingRef = useRef(false);
  useEffect(() => {
    if (readyId !== id) return undefined;
    if (skipNextLiveSyncRef.current) {
      skipNextLiveSyncRef.current = false;
      return undefined;
    }
    // VIS-1110 (spurious "unsaved changes" dialog + a redundant draft POST on
    // every source-tile browse): a browse-only seed's generic model tab can
    // be silently auto-renamed by `ExplorationBuildRail`'s live-suggestion
    // effect (T3, D11) the instant a source anchor is available — that
    // rename touches the SAME `explorerModelTabs`/`explorerModelStates`
    // fields this effect watches, even though nothing the user actually
    // authored has changed. Arming the debounce below for that alone would
    // eventually flip `syncStatus` to 'saving' (the tab's dirty dot, which
    // routes a close through the confirm dialog) and fire a backend POST,
    // purely from opening and looking at a browse tile.
    //
    // Gate on the SAME `isExplorationVisibleInGallery` predicate the Home
    // gallery and the tab-close GC (`closeWorkspaceTab`) already use as the
    // single source of truth for "is this seed still just a browse gesture"
    // — evaluated against a FRESH live snapshot (not the possibly-stale
    // persisted `record`), so a rename that lands the same tick this effect
    // fires is judged on what it actually changed, not last cycle's draft.
    // If the exploration still isn't "real" yet even with this tick's
    // change folded in, there is nothing here worth persisting — skip
    // arming the debounce entirely for this tick. A record that's ALREADY
    // visible (no seed, already renamed, already promoted, or already has
    // real content) is untouched by this gate: `isExplorationVisibleInGallery`
    // short-circuits true immediately for those, so every ordinary edit on
    // an ordinary exploration arms the debounce exactly as before. And a
    // genuine first real edit on a browse seed (SQL typed, a second model
    // added, …) makes the SAME predicate true the moment it lands — this
    // effect re-runs on every one of those watched-field changes, so real
    // content is never silently dropped, only ever delayed until it exists.
    if (record && !isExplorationVisibleInGallery({ ...record, draft: legacyStateToDraft(snapshotExplorerWorkingState()) })) {
      return undefined;
    }
    if (liveSyncTimerRef.current) clearTimeout(liveSyncTimerRef.current);
    liveSyncPendingRef.current = true;
    liveSyncTimerRef.current = setTimeout(() => {
      liveSyncPendingRef.current = false;
      const snapshot = snapshotExplorerWorkingState();
      updateExplorationDraft(id, legacyStateToDraft(snapshot));
    }, LIVE_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(liveSyncTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    id,
    readyId,
    explorerModelTabs,
    explorerModelStates,
    explorerChartName,
    explorerChartLayout,
    explorerChartInsightNames,
    explorerInsightStates,
    explorerLeftNavCollapsed,
    explorerCenterMode,
    explorerIsEditorCollapsed,
  ]);

  // Phase 6c-T5 (ux-audit.md "⚠ conflicts-with-e2e Reload silently discards
  // recent SQL edits (autosave debounce race)" / its MINOR duplicate "Edits
  // made seconds before closing the browser are silently lost"):
  //
  // THE BUG: this pane's own live-sync debounce (600ms above) plus the
  // slice's backend-persist debounce (`updateExplorationDraft`'s internal
  // ~1s, `workspaceExplorationsStore.js`) stack into a combined ~1.6s window
  // where a just-typed edit sits in memory only. A reload/close inside that
  // window loses it — older edits (outside the window) DO autosave, so the
  // bug reads as "sometimes" losing work, which is exactly what the audit
  // reproduced.
  //
  // THE FIX: flush BOTH debounces immediately, synchronously, the instant
  // the page starts to go away — `visibilitychange`→'hidden' fires on tab
  // close/reload/backgrounding, reliably BEFORE the page is torn down (an
  // in-flight fetch has real odds of completing); `pagehide`/`beforeunload`
  // are a second, later-firing net for browsers/paths that skip visibility
  // events. All three read the CURRENT legacy working state (not a stale
  // closure) and go through the exact same `updateExplorationDraft` +
  // `flushExplorationSync` primitives the deactivate-cleanup effect already
  // uses — this is that same safety net, just triggered by "the page itself
  // is leaving" instead of "React is unmounting this pane component" (a
  // real browser close/reload fires neither of THOSE — this effect's
  // listeners are the only thing that ever runs in that case).
  //
  // Best-effort by nature: a fetch started this late can still be aborted by
  // an instantaneous hard browser kill — no client-side flush can fully
  // close that window (only `sendBeacon`/service-worker background sync
  // could, and neither fits this contract cleanly) — but this closes the
  // window the audit actually reproduced (~1s of normal typing-then-reload),
  // which is the realistic, common case.
  //
  // GUARD (found via e2e, #19 cross-tab-concurrency; refined via VIS-1107):
  // re-snapshotting and pushing a FRESH `updateExplorationDraft` only
  // happens if `liveSyncPendingRef` says an edit hasn't even been handed
  // off to the backend-persist debounce yet. Without this, `flushNow` used
  // to unconditionally re-POST this pane's CURRENT client snapshot on every
  // reload/hide — including when nothing had changed locally since the
  // debounce last fired. That's harmless when this tab's own snapshot is
  // the freshest thing around, but not on the losing side of a cross-tab
  // last-write-wins race (a sibling tab/browser context wrote AFTER this
  // tab's own snapshot was taken): reloading the LOSING tab would silently
  // re-push its stale snapshot and clobber the winner's already-persisted
  // draft, right as the page reloaded to go read it back.
  //
  // VIS-1107 (Urgent, found via e2e — `exploration-reload-persistence.
  // spec.mjs:129`'s x/y-pill scenario): that guard alone was too narrow.
  // `liveSyncPendingRef` only tracks THIS effect's own 600ms client timer —
  // it does NOT track `workspaceExplorationsStore.js`'s SEPARATE ~1s
  // backend-persist debounce (`_pendingSyncTimers`) that `updateExploration
  // Draft` (re)arms every time it's called, including from the 600ms
  // timer's OWN natural-fire callback above (which calls
  // `updateExplorationDraft` but deliberately does NOT force-flush it — a
  // normal, un-hurried edit is meant to ride out its own ~1s window). So:
  // edit → 600ms timer fires naturally → hands off to the ~1s backend
  // debounce → `liveSyncPendingRef` is now false (the OUTER layer says
  // "done") → reload happens before that ~1s INNER timer completes → the
  // old guard treated "outer layer idle" as "nothing to flush" and
  // skipped calling `flushExplorationSync` entirely, so the still-queued
  // inner write was silently dropped along with the page.
  //
  // THE FIX: `flushExplorationSync` is already a safe no-op when nothing is
  // queued in `_pendingSyncTimers` (checked internally, keyed by id) — so
  // it can ALWAYS be called unconditionally here without risk of reviving
  // or clobbering anything. Only the "capture a FRESH snapshot and hand it
  // to `updateExplorationDraft`" step stays gated on `liveSyncPendingRef`,
  // since that's the part that could push a stale snapshot in the cross-tab
  // clobber scenario — forcing through whatever the store ALREADY has
  // queued carries no such risk, since it isn't reintroducing a snapshot,
  // just accelerating a write the store already decided to make.
  //
  // Verified empirically (not just reasoned about): an instrumented repro
  // showed the natural-fire → reload sequence above producing ZERO network
  // requests around the reload in the x/y-pill case, vs. a completed POST
  // in the SQL-only case (which reloads before the outer timer ever fires
  // naturally) — see VIS-1107 for the full request/console timeline.
  useEffect(() => {
    if (readyId !== id) return undefined;
    const flushNow = () => {
      if (liveSyncPendingRef.current) {
        if (liveSyncTimerRef.current) {
          clearTimeout(liveSyncTimerRef.current);
          liveSyncTimerRef.current = null;
        }
        liveSyncPendingRef.current = false;
        const snapshot = snapshotExplorerWorkingState();
        updateExplorationDraft(id, legacyStateToDraft(snapshot));
      }
      flushExplorationSync(id);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('beforeunload', flushNow);
    };
  }, [
    id,
    readyId,
    snapshotExplorerWorkingState,
    updateExplorationDraft,
    flushExplorationSync,
  ]);

  const handleRename = useCallback(
    nextName => {
      renameExploration(id, nextName);
    },
    [id, renameExploration]
  );

  // VIS-1070 — "Re-check references": re-runs the SAME staleness check
  // against whatever the live store looks like RIGHT NOW (picks up an edit
  // the user just made, or an object someone else just published) rather
  // than only ever reflecting the moment-of-resume snapshot.
  const handleRecheckStaleness = useCallback(() => {
    const current = useStore.getState().workspaceExplorations?.byId?.[id];
    if (!current) return;
    setStaleness(computeExplorationStaleness(current, useStore.getState()));
  }, [id]);
  const handleDismissStaleness = useCallback(() => setStalenessDismissed(true), []);

  // VIS-1086: in-flight guard against a double-click on Duplicate — checked
  // synchronously INSIDE the handler (a real double-click can dispatch both
  // click events before React re-renders the button `disabled`, which is
  // still set below as the visible affordance, not the actual guard).
  // ExplorationPane isn't remounted when `id` changes (switching tabs is a
  // prop change on the SAME instance, per MiddlePane's dispatch) — reset the
  // guard on `id` change so a duplicate still in flight for the OLD
  // exploration never leaves the button stuck disabled for a DIFFERENT one.
  const duplicatingRef = useRef(false);
  const [duplicating, setDuplicating] = useState(false);
  useEffect(() => {
    duplicatingRef.current = false;
    setDuplicating(false);
  }, [id]);

  const handleDuplicate = useCallback(async () => {
    if (duplicatingRef.current) return;
    duplicatingRef.current = true;
    setDuplicating(true);
    try {
      // Flush this exploration's own latest edits first so the duplicate
      // seeds from up-to-date state, not a stale pre-debounce draft.
      await flushExplorationSync(id);
      const result = await duplicateExploration(id);
      if (result?.success) {
        openWorkspaceTab({
          id: `exploration:${result.id}`,
          type: 'exploration',
          name: result.id,
        });
      }
    } finally {
      duplicatingRef.current = false;
      setDuplicating(false);
    }
  }, [id, flushExplorationSync, duplicateExploration, openWorkspaceTab]);

  if (!record) {
    if (!fetched) {
      return (
        <section
          data-testid="workspace-middle-exploration-loading"
          className="flex h-full w-full flex-col bg-gray-50"
        >
          <SubBar testId="workspace-subbar-exploration" left={<span className="text-[12px] text-gray-400">Loading…</span>} />
          <CenteredFrameState
            testId="exploration-pane-loading"
            title="Loading exploration…"
            icon={PiCircleNotch}
            spin
          />
        </section>
      );
    }
    return (
      <section
        data-testid="workspace-middle-exploration-not-found"
        className="flex h-full w-full flex-col bg-gray-50"
      >
        <SubBar
          testId="workspace-subbar-exploration"
          left={<span className="text-[12px] font-semibold text-gray-900">Exploration not found</span>}
        />
        <CenteredFrameState
          testId="exploration-pane-not-found"
          title="This exploration doesn't exist"
          body="It may have been deleted. Head back to Explorer Home to start a new one."
          icon={PiCircleNotch}
        />
      </section>
    );
  }

  if (readyId !== id) return null; // restore is landing this tick

  return (
    <section
      data-testid="workspace-middle-exploration"
      className="flex h-full w-full flex-col bg-gray-50"
    >
      <SubBar
        testId="workspace-subbar-exploration"
        left={
          <div className="flex min-w-0 items-center gap-2 text-[12px]">
            <span
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${EXPLORATION_COLORS.bg} ${EXPLORATION_COLORS.text}`}
            >
              {ExplorationIcon && <ExplorationIcon style={{ fontSize: 13 }} />}
            </span>
            <RenameField name={record.name} onCommit={handleRename} />
          </div>
        }
        right={
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={duplicating}
            title="Duplicate this exploration"
            data-testid="exploration-duplicate-button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PiCopy style={{ fontSize: 13 }} /> Duplicate
          </button>
        }
      />
      {record.syncStatus === 'deleted-remotely' && <ExplorationDeletedRemotelyBanner id={id} />}
      {!stalenessDismissed && staleness?.stale && (
        <ExplorationStalenessBanner
          danglingRefs={staleness.danglingRefs}
          driftedFrom={staleness.driftedFrom}
          onRecheck={handleRecheckStaleness}
          onDismiss={handleDismissStaleness}
        />
      )}
      <ExplorationWorkbench />
    </section>
  );
};

export default ExplorationPane;
