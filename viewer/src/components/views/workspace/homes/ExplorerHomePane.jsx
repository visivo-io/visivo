import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PiPlus, PiCompass } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import SubBar from '../SubBar';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';
import { useConfirm } from '../../../common/ConfirmDialog';
import ExplorationCard from './ExplorationCard';
import { computeExplorationStaleness } from '../explorationStaleness';
import { isExplorationVisibleInGallery } from '../explorationLifecycle';

const ExplorerIcon = getTypeIcon('explorer');
const EXPLORER_COLORS = getTypeColors('explorer');
const SourceIcon = getTypeIcon('source');
const SOURCE_COLORS = getTypeColors('source');

/**
 * ExplorerHomePane — the real Explorer Home gallery (Explore 2.0 Phase 2,
 * replacing the Phase 0 placeholder). Rendered when `activeView === 'explorer'`
 * and no document tab is active (01-ux-spec.md §2):
 *
 *   - Header + "+ New exploration" — mints via the slice, opens its tab. An
 *     explicit, deliberate create — always real, always shown immediately.
 *   - "Start from a source" tiles — one click mints an exploration seeded
 *     with `{type:'source', name}` (`legacyStateForSeed` pre-wires the SQL
 *     editor to that source on first open) and opens its tab. A BROWSE
 *     gesture, not a commitment: the record persists (stable id from the
 *     first render) but stays OUT of this gallery — and gets cleaned up if
 *     its tab closes untouched — until the user actually does something
 *     with it (`isExplorationVisibleInGallery`, `explorationLifecycle.js`).
 *     This is the Phase 6c-T5 fix for ux-audit.md's "clicking a source tile
 *     silently creates a new persistent exploration every time" / "every
 *     source-tile click mints a new auto-named exploration" / the phantom
 *     'Scratch' seed (deleted below — a genuinely empty gallery is now a
 *     real, honest state, not one papered over with fabricated history).
 *   - "Recent explorations" — cards (name / edit time / draft summary /
 *     provenance, `ExplorationCard`) with Open / rename / duplicate / delete,
 *     filtered to only the explorations that clear the "real" bar above.
 *     Delete goes through `useConfirm()`; if that exploration's tab happens
 *     to be open (even parked), the slice force-closes it with a toast
 *     (`deleteExploration`, 01-ux-spec.md §4) — this pane doesn't need to
 *     know that happened, it just calls delete.
 *
 * Promotion count (Phase 4) and the staleness badge (Phase 5,
 * `computeExplorationStaleness`) are both wired now — the mock's end state.
 */
const ExplorerHomePane = () => {
  const explorations = useStore(s => s.workspaceExplorations);
  const fetched = useStore(s => s.workspaceExplorationsFetched);
  const sources = useStore(s => s.sources);
  const createExploration = useStore(s => s.createExploration);
  const duplicateExploration = useStore(s => s.duplicateExploration);
  const renameExploration = useStore(s => s.renameExploration);
  const deleteExploration = useStore(s => s.deleteExploration);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);

  const { confirm, ConfirmDialog } = useConfirm();

  const orderedExplorations = useMemo(
    () => (explorations.order || []).map(id => explorations.byId[id]).filter(Boolean),
    [explorations]
  );

  // Phase 6c-T5 (ux-audit.md "Phantom 'Scratch' exploration" /
  // "clicking a source tile silently creates a new persistent exploration"):
  // the gallery only ever shows explorations that clear the "real" bar —
  // see `explorationLifecycle.js`'s docstring. A blank "+ New exploration"
  // record always clears it; a source-tile/"Explore this" seed only does
  // once it has real content, has been renamed, or has been promoted. There
  // is deliberately no more lazy auto-seed here — a brand-new project's
  // gallery is genuinely empty, and the empty state below says so honestly
  // instead of fabricating a 'Scratch' card with a fake edit history.
  const visibleExplorations = useMemo(
    () => orderedExplorations.filter(isExplorationVisibleInGallery),
    [orderedExplorations]
  );

  // VIS-1070 — staleness badge (01-ux-spec.md §2's "⚠ stale (orders
  // changed)" end-state). Computed once per card here (not inside
  // ExplorationCard itself) so the check runs against a SINGLE consistent
  // state snapshot for the whole gallery rather than N independent reads.
  const stalenessById = useMemo(() => {
    const state = useStore.getState();
    const map = {};
    visibleExplorations.forEach(exploration => {
      map[exploration.id] = computeExplorationStaleness(exploration, state);
    });
    return map;
  }, [visibleExplorations]);

  const openExploration = id => {
    openWorkspaceTab({ id: `exploration:${id}`, type: 'exploration', name: id });
  };

  // VIS-1084: `handleNew`/`handleSourceTile` await a real network round-trip
  // before navigating. If the user switches destinations (ViewSwitcher row,
  // Cmd+2/3) while that's in flight, THIS component unmounts — MiddlePane
  // renders a different destination's Home instead (or a document tab) — but
  // the create's completion doesn't know that and used to force-navigate
  // into the new exploration regardless, yanking the user back to a screen
  // they'd already deliberately left. `mountedRef` (same pattern as
  // `useRecordSave.js`/`useDebouncedSave.js`) makes the post-await navigate
  // conditional on this instance still being mounted; the exploration itself
  // is still created and persisted either way — it just won't be forced open.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Reset on EVERY effect run, not just at the `useRef(true)` initializer —
    // React 18 StrictMode (index.jsx wraps the app in it) double-invokes
    // mount effects in development: mount -> cleanup -> mount again. Without
    // this reset, the cleanup's `mountedRef.current = false` from that
    // simulated first "unmount" would stick permanently false even though
    // the component is genuinely mounted and interactive — exactly the
    // regression this comment is here to prevent from recurring. Same
    // pattern as `useRecordSave.js`/`useDebouncedSave.js`.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // VIS-1086: guard every create door with an in-flight ref CHECKED INSIDE
  // THE HANDLER — a real double-click can dispatch both click events before
  // React has a chance to re-render the button `disabled` (that attribute
  // is still set below, as the visible affordance, but it's a secondary
  // defense, not the actual guard). `creatingRef` blocks a second call
  // synchronously; `creating` state drives the disabled UI. Shared across
  // "+ New exploration" AND every source tile — a fast double-click across
  // TWO different doors races the exact same backend `_default_name()`
  // window as two clicks of the same one.
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);

  const handleNew = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const result = await createExploration();
      if (result?.success && mountedRef.current) openExploration(result.id);
    } finally {
      creatingRef.current = false;
      if (mountedRef.current) setCreating(false);
    }
  };

  const handleSourceTile = async sourceName => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const result = await createExploration({ type: 'source', name: sourceName });
      if (result?.success && mountedRef.current) openExploration(result.id);
    } finally {
      creatingRef.current = false;
      if (mountedRef.current) setCreating(false);
    }
  };

  const handleDuplicate = async id => {
    const result = await duplicateExploration(id);
    if (result?.success) openExploration(result.id);
  };

  const handleRename = (id, name) => {
    renameExploration(id, name);
  };

  const handleDelete = async exploration => {
    const ok = await confirm({
      title: `Delete "${exploration.name}"?`,
      body: 'This removes the exploration and its draft. Anything already saved to the project is unaffected.',
      confirmLabel: 'Delete',
      danger: true,
      testId: 'exploration-delete-confirm',
    });
    if (ok) deleteExploration(exploration.id);
  };

  return (
    <section
      data-testid="workspace-middle-explorer"
      className="flex h-full w-full flex-col overflow-y-auto bg-gray-50"
    >
      <SubBar
        testId="workspace-subbar-explorer"
        left={
          <div className="flex items-center gap-2 text-[12px]">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded ${EXPLORER_COLORS.bg} ${EXPLORER_COLORS.text}`}
            >
              {ExplorerIcon && <ExplorerIcon style={{ fontSize: 13 }} />}
            </span>
            <span className="font-semibold text-gray-900">Explorer</span>
          </div>
        }
        right={
          <button
            type="button"
            onClick={handleNew}
            disabled={creating}
            data-testid="explorer-home-new-exploration"
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PiPlus style={{ fontSize: 13 }} /> New exploration
          </button>
        }
      />

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        <h1 className="text-[20px] font-semibold text-gray-900">Explore your data</h1>

        {sources.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
              Start from a source
            </h2>
            <div className="flex flex-wrap gap-2">
              {sources.map(source => (
                <button
                  key={source.name}
                  type="button"
                  onClick={() => handleSourceTile(source.name)}
                  disabled={creating}
                  data-testid={`explorer-home-source-tile-${source.name}`}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${SOURCE_COLORS.border} ${SOURCE_COLORS.text} hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {SourceIcon && <SourceIcon style={{ fontSize: 14 }} />}
                  {source.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
            Recent explorations
          </h2>
          {!fetched ? (
            <div
              data-testid="explorer-home-loading"
              className="rounded-lg border border-dashed border-gray-300 p-6 text-[13px] text-gray-400"
            >
              Loading…
            </div>
          ) : visibleExplorations.length === 0 ? (
            // Phase 6c-T5: a genuinely empty gallery, honestly presented —
            // no fabricated 'Scratch' card, no fake "edited 0 seconds ago"
            // history (ux-audit.md's phantom-exploration finding). Points at
            // the two real ways to start one.
            <div
              data-testid="explorer-home-empty"
              className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 p-6 text-[13px] text-gray-500"
            >
              <PiCompass className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              No explorations yet — click a source above or "New exploration" to start one.
            </div>
          ) : (
            <div
              data-testid="explorer-home-gallery"
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
            >
              {visibleExplorations.map(exploration => (
                <ExplorationCard
                  key={exploration.id}
                  exploration={exploration}
                  onOpen={openExploration}
                  onRename={handleRename}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  // No `?.`/`|| []` fallback needed: `stalenessById` is built
                  // by iterating this SAME `orderedExplorations` array in the
                  // SAME render (the `useMemo` above), and
                  // `computeExplorationStaleness` always returns both
                  // `stale`/`danglingRefs` — so every id rendered here is
                  // guaranteed to have an entry.
                  stale={stalenessById[exploration.id].stale}
                  danglingRefs={stalenessById[exploration.id].danglingRefs}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {ConfirmDialog}
    </section>
  );
};

export default ExplorerHomePane;
