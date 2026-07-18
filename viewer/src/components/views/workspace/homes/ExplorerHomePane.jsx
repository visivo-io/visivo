import React, { useEffect, useMemo, useRef } from 'react';
import { PiPlus, PiCircleNotch } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import SubBar from '../SubBar';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';
import { useConfirm } from '../../../common/ConfirmDialog';
import ExplorationCard from './ExplorationCard';

const ExplorerIcon = getTypeIcon('explorer');
const EXPLORER_COLORS = getTypeColors('explorer');
const SourceIcon = getTypeIcon('source');
const SOURCE_COLORS = getTypeColors('source');

/**
 * ExplorerHomePane — the real Explorer Home gallery (Explore 2.0 Phase 2,
 * replacing the Phase 0 placeholder). Rendered when `activeView === 'explorer'`
 * and no document tab is active (01-ux-spec.md §2):
 *
 *   - Header + "+ New exploration" — mints via the slice, opens its tab.
 *   - "Start from a source" tiles — one click mints an exploration seeded
 *     with `{type:'source', name}` (`legacyStateForSeed` pre-wires the SQL
 *     editor to that source on first open) and opens its tab.
 *   - "Recent explorations" — cards (name / edit time / draft summary /
 *     provenance, `ExplorationCard`) with Open / rename / duplicate / delete.
 *     Delete goes through `useConfirm()`; if that exploration's tab happens
 *     to be open (even parked), the slice force-closes it with a toast
 *     (`deleteExploration`, 01-ux-spec.md §4) — this pane doesn't need to
 *     know that happened, it just calls delete.
 *   - Lazily seeds one auto-named "Scratch" exploration when the list is
 *     empty (after the fetch has settled — never race a real list) so the
 *     first visit is never empty.
 *
 * Promotion count (Phase 4) and the staleness badge (Phase 5) are
 * intentionally absent from the card — the mock depicts the end state.
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

  const openExploration = id => {
    openWorkspaceTab({ id: `exploration:${id}`, type: 'exploration', name: id });
  };

  // Seed one auto-named "Scratch" exploration when the list is genuinely
  // empty (never before the fetch settles — that would race a real list
  // that just hasn't landed yet). Guarded so it only ever fires once per
  // mount even if this effect re-runs before the created record lands in
  // `order`.
  const seedingRef = useRef(false);
  useEffect(() => {
    if (!fetched || orderedExplorations.length > 0 || seedingRef.current) return;
    seedingRef.current = true;
    createExploration();
  }, [fetched, orderedExplorations.length, createExploration]);

  const handleNew = async () => {
    const result = await createExploration();
    if (result?.success) openExploration(result.id);
  };

  const handleSourceTile = async sourceName => {
    const result = await createExploration({ type: 'source', name: sourceName });
    if (result?.success) openExploration(result.id);
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
      body: 'This removes the exploration and its draft. Anything already promoted to the project is unaffected.',
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
            data-testid="explorer-home-new-exploration"
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
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
                  data-testid={`explorer-home-source-tile-${source.name}`}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${SOURCE_COLORS.border} ${SOURCE_COLORS.text} hover:bg-orange-50`}
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
          {orderedExplorations.length === 0 ? (
            <div
              data-testid="explorer-home-empty"
              className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 p-6 text-[13px] text-gray-500"
            >
              <PiCircleNotch className="h-4 w-4 animate-spin" aria-hidden="true" />
              Setting up your first exploration…
            </div>
          ) : (
            <div
              data-testid="explorer-home-gallery"
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
            >
              {orderedExplorations.map(exploration => (
                <ExplorationCard
                  key={exploration.id}
                  exploration={exploration}
                  onOpen={openExploration}
                  onRename={handleRename}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
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
