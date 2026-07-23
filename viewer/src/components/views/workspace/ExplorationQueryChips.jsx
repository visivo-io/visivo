import React, { useCallback, useMemo } from 'react';
import { PiPlus, PiDotsThree, PiLink } from 'react-icons/pi';
import useStore from '../../../stores/store';
import Dropdown from '../../common/Dropdown';
import { useConfirm } from '../../common/ConfirmDialog';
import InlineRenameInput from './InlineRenameInput';
import useInlineRename from '../../../hooks/useInlineRename';
import { countReferencingInsights } from '../../../utils/refWalk';
import { getTypeColors } from '../common/objectTypeConfigs';

// P5-D7 (e2e-gap-review.md final delta pass): the referenced-by badge is a
// reference COUNT on a query/model object, so `model`'s token family (never
// a hand-rolled `bg-teal-*`/`text-teal-*` pair) is the right source —
// mirrors how `DraggableColumnHeader.jsx`/`AddComputedColumnPopover.jsx`
// were migrated off hardcoded cyan/teal in the Phase 5 restyle sweep
// (commit befa20a4, B9). `OBJECT_TYPES` is a module-scope constant, so this
// lookup is stable and safe to hoist out of the component (matches
// `WorkspaceDndContext.jsx`'s `DASH_COLORS` precedent).
const REF_BADGE_COLORS = getTypeColors('model');

/**
 * ExplorationQueryChips — Explore 2.0 Phase 3a (01-ux-spec.md §3).
 *
 * Replaces the retired `ModelTabBar` (horizontal bordered tabs) — the
 * standalone `/explorer` route that used to keep `ModelTabBar` alive is
 * deleted at the Phase 3b cutover, so this is now `CenterPanel`'s only
 * `modelTabBar` (see that component's docstring). Same underlying store —
 * `explorerModelTabs`/`explorerActiveModelName`/
 * `switchModelTab`/`createModelTab`/`closeModelTab`/`renameModelTab` (a
 * "model tab" IS a scratch query) — just a compact chip anatomy instead of
 * bordered tabs:
 *
 *   [● orders_q ⛓2 ⋮] [○ cohort_q] [+]
 *
 *   - run-status dot: green (last run succeeded) · red (last run errored) ·
 *     gray (not yet run) — read straight off `explorerModelStates[name]`
 *     (`queryResult`/`queryError`), no separate tracking needed.
 *   - ⛓n referenced-by badge: how many of the chart's draft insights
 *     reference this query (successor to `ModelTabBar`'s boolean
 *     `ring-purple` — a COUNT now), via the shared `refWalk` util (B16).
 *   - ⋮ menu (active chip only, mirroring `ModelTabBar`'s rename-only-when-
 *     active convention... actually ModelTabBar allowed rename on any tab via
 *     double-click; here it's exposed via the ACTIVE chip's kebab, since a
 *     compact chip has no room for a persistent affordance on every chip):
 *     Rename (shared `useInlineRename`, B16) and Delete — Delete warns via
 *     `ConfirmDialog` when the query has draft-insight referrers (the
 *     `explorer-insight-survives-model-close.spec.mjs` regression class's
 *     query-chip successor, 03-delivery-plan.md Phase 3a gate).
 *   - Cannot delete the last remaining chip (an exploration always has at
 *     least one query) — mirrors `ModelTabBar`'s `showCloseButton`.
 *   - [+] creates a new chip (`createModelTab()`, auto-named + disambiguated
 *     — cross-type uniqueness enforced by the store's `assertNameUnique`).
 *
 * Most explorations are single-query, so with one tab this collapses to
 * just `[● query_1] [+]` — no menu needed until there's something to
 * rename/delete relative to (a lone chip still gets its menu on select,
 * consistent rather than a special-cased single-chip UI).
 */

const RunStatusDot = ({ modelState }) => {
  const status = !modelState ? 'idle' : modelState.queryError ? 'error' : modelState.queryResult ? 'success' : 'idle';
  const cls =
    status === 'success' ? 'bg-green-500' : status === 'error' ? 'bg-highlight-500' : 'bg-gray-300';
  const title =
    status === 'success' ? 'Last run: success' : status === 'error' ? 'Last run: error' : 'Not yet run';
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`}
      title={title}
      data-testid="query-chip-status-dot"
      data-status={status}
    />
  );
};

const QueryChip = ({
  name,
  active,
  modelState,
  referencedCount,
  canDelete,
  onActivate,
  onRenameCommit,
  onDelete,
}) => {
  const rename = useInlineRename({ onCommit: onRenameCommit });
  const { confirm, ConfirmDialog: deleteConfirmDialog } = useConfirm();

  const handleDeleteClick = useCallback(
    async close => {
      close();
      if (referencedCount > 0) {
        const ok = await confirm({
          title: `Delete "${name}"?`,
          body: `${referencedCount} draft insight${referencedCount === 1 ? '' : 's'} reference${
            referencedCount === 1 ? 's' : ''
          } this query. Deleting it may break ${referencedCount === 1 ? 'it' : 'them'}.`,
          confirmLabel: 'Delete anyway',
          danger: true,
          testId: `query-chip-${name}-delete-confirm`,
        });
        if (!ok) return;
      }
      onDelete(name);
    },
    [confirm, referencedCount, name, onDelete]
  );

  if (rename.editing) {
    return (
      <div
        data-testid={`query-chip-${name}`}
        className="flex h-6 items-center gap-1 rounded-md border border-primary-300 bg-white px-1.5"
      >
        <InlineRenameInput
          name={name}
          testIdPrefix={`query-chip-${name}-rename`}
          onCommit={rename.commit}
          onCancel={rename.cancel}
        />
        {rename.error && (
          <span
            data-testid={`query-chip-${name}-rename-error`}
            className="text-[10px] text-highlight-600"
          >
            {rename.error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`query-chip-${name}`}
      data-active={active ? 'true' : 'false'}
      onClick={() => onActivate(name)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(name);
        }
      }}
      className={[
        'flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md pl-2 pr-1 text-[11px] transition-colors',
        active
          ? 'border border-primary-200 bg-primary-50 text-primary-700'
          : 'border border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200/70',
      ].join(' ')}
    >
      <RunStatusDot modelState={modelState} />
      <span className="max-w-[140px] truncate font-medium">{name}</span>
      {referencedCount > 0 && (
        <span
          data-testid={`query-chip-${name}-ref-badge`}
          title={`${referencedCount} draft insight${referencedCount === 1 ? '' : 's'} reference this query`}
          className={`ml-0.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold ${REF_BADGE_COLORS.bg} ${REF_BADGE_COLORS.text}`}
        >
          <PiLink className="h-2.5 w-2.5" aria-hidden="true" />
          {referencedCount}
        </span>
      )}
      {active && (
        // Stop the click from bubbling to the chip's own onClick (onActivate)
        // — but only AFTER Dropdown's own trigger wrapper has had a chance to
        // toggle the panel: Dropdown puts its open-toggle onClick on a div
        // wrapping `trigger`, and a *descendant* handler that calls
        // stopPropagation would suppress that toggle too. Stopping
        // propagation here (a sibling-level ancestor of Dropdown's own
        // wrapper) lets the toggle fire first, then blocks it from reaching
        // the chip.
        <span onClick={e => e.stopPropagation()}>
          <Dropdown
            align="left"
            width={140}
            trigger={
              <button
                type="button"
                title="Query options"
                aria-label={`Options for ${name}`}
                data-testid={`query-chip-${name}-menu-trigger`}
                className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-primary-400 hover:bg-primary-100 hover:text-primary-600"
              >
                <PiDotsThree className="h-3 w-3" />
              </button>
            }
          >
            {close => (
              <div className="py-1">
                <button
                  type="button"
                  data-testid={`query-chip-${name}-rename-action`}
                  onClick={() => {
                    close();
                    rename.start();
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-gray-800 hover:bg-gray-50"
                >
                  Rename
                </button>
                {canDelete && (
                  <button
                    type="button"
                    data-testid={`query-chip-${name}-delete-action`}
                    onClick={() => handleDeleteClick(close)}
                    className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-highlight-600 hover:bg-highlight-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </Dropdown>
        </span>
      )}
      {deleteConfirmDialog}
    </div>
  );
};

const ExplorationQueryChips = () => {
  const tabs = useStore(s => s.explorerModelTabs);
  const activeModelName = useStore(s => s.explorerActiveModelName);
  const modelStates = useStore(s => s.explorerModelStates);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const insightStates = useStore(s => s.explorerInsightStates);
  const switchModelTab = useStore(s => s.switchModelTab);
  const createModelTab = useStore(s => s.createModelTab);
  const closeModelTab = useStore(s => s.closeModelTab);
  const renameModelTab = useStore(s => s.renameModelTab);

  const referencedCounts = useMemo(
    () => countReferencingInsights(tabs, chartInsightNames, insightStates),
    [tabs, chartInsightNames, insightStates]
  );

  return (
    <div
      className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-secondary-200 bg-white px-2 py-1.5"
      data-testid="exploration-query-chips"
    >
      {tabs.map(name => (
        <QueryChip
          key={name}
          name={name}
          active={name === activeModelName}
          modelState={modelStates[name]}
          referencedCount={referencedCounts.get(name) || 0}
          canDelete={tabs.length > 1}
          onActivate={switchModelTab}
          onRenameCommit={nextName => renameModelTab(name, nextName)}
          onDelete={closeModelTab}
        />
      ))}
      <button
        type="button"
        onClick={() => createModelTab()}
        title="New query"
        aria-label="New query"
        data-testid="query-chip-add"
        // B14 part 2 (Explore 2.0 Phase 3b cutover): retargets the
        // onboarding manifest's `build_model` item, whose old anchor
        // (`model-tab-bar`, the retired horizontal ModelTabBar's "+") has
        // zero remaining producers now that this chip row replaces it.
        data-onb-target="query-chip-add"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-500"
      >
        <PiPlus className="h-3 w-3" />
      </button>
    </div>
  );
};

export default ExplorationQueryChips;
