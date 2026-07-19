import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { PiPencilSimple, PiCopy, PiCircleNotch } from 'react-icons/pi';
import useStore from '../../../stores/store';
import SubBar from './SubBar';
import ExplorationWorkbench from './ExplorationWorkbench';
import ExplorationDeletedRemotelyBanner from './ExplorationDeletedRemotelyBanner';
import InlineRenameInput from './InlineRenameInput';
import useInlineRename from '../../../hooks/useInlineRename';
import { getTypeIcon, getTypeColors } from '../common/objectTypeConfigs';
import { legacyStateToDraft, draftToLegacyState } from './explorationLegacyBridge';

const ExplorationIcon = getTypeIcon('exploration');
const EXPLORATION_COLORS = getTypeColors('exploration');

// Debounce for the "still editing" persist — separate from (and shorter
// than) the slice's own ~1s backend-POST debounce (updateExplorationDraft
// already re-arms that internally on every call); this one just throttles
// how often we bother computing a snapshot from the legacy store at all.
const LIVE_SYNC_DEBOUNCE_MS = 600;

const FrameState = ({ testId, title, body, icon: Icon = PiCircleNotch, spin = false }) => (
  <div data-testid={testId} className="flex flex-1 items-center justify-center bg-gray-50 p-12">
    <div className="max-w-[420px] rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <Icon
        className={`mx-auto mb-2 h-6 w-6 text-gray-300 ${spin ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      {body && (
        <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-gray-500">
          {body}
        </p>
      )}
    </div>
  </div>
);

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
 * `ExplorationWorkbench` (the actual legacy 3-panel bundle) is gated on the
 * restore having landed for the CURRENT `id` — mounting it one tick early
 * would let `useExplorerWorkbenchInit`'s "auto-create when empty" fire
 * against a transient empty state that's about to be overwritten.
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
  useEffect(() => {
    if (readyId !== id) return undefined;
    if (skipNextLiveSyncRef.current) {
      skipNextLiveSyncRef.current = false;
      return undefined;
    }
    if (liveSyncTimerRef.current) clearTimeout(liveSyncTimerRef.current);
    liveSyncTimerRef.current = setTimeout(() => {
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

  const handleRename = useCallback(
    nextName => {
      renameExploration(id, nextName);
    },
    [id, renameExploration]
  );

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
          <FrameState testId="exploration-pane-loading" title="Loading exploration…" spin />
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
        <FrameState
          testId="exploration-pane-not-found"
          title="This exploration doesn't exist"
          body="It may have been deleted. Head back to Explorer Home to start a new one."
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
      <ExplorationWorkbench id={id} />
    </section>
  );
};

export default ExplorationPane;
