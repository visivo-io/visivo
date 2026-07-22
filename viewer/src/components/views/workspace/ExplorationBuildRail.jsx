import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { PiPlus, PiFloppyDisk, PiCheckCircle } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { selectHasModifications, getAllKnownNames } from '../../../stores/explorerStore';
import { generateUniqueName } from '../../../utils/uniqueName';
import { isGenericPromoteName } from './promoteNaming';
import InsightBuildSection from './InsightBuildSection';
import ChartBuildSection from './ChartBuildSection';
import ExplorationPromoteModal from './ExplorationPromoteModal';
import { recordOnboardingAction } from '../../onboarding/onboardingState';

// A single stable reference for the "no promoted entries" case — a fresh `[]`
// literal returned from a Zustand selector on every render breaks the
// store's reference-equality check and infinite-loops the subscription.
const EMPTY_PROMOTED = [];

/**
 * ExplorationBuildRail — Explore 2.0 Phase 3b (VIS-1059) + Phase 4 (VIS-1062–
 * 1066, promote-gate rebuild); re-parented into the shell's single
 * `<RightRail>` at 6c-T2 (D6 — the two-rails fix). Same overall composition
 * (Chart section always on top, stacked Insight sections below, Add Insight,
 * Save to Project) — the CRUD sections are built onto `TracePropsEditor`/
 * `FieldGroupList` (`InsightBuildSection`/`ChartBuildSection`) instead of
 * `SchemaEditor`; those internals (and the DnD they wire up) are OUT OF
 * SCOPE for this component's own edits — see `InsightBuildSection.jsx`/
 * `TracePropsEditor.jsx`/`PillMenu` for that half of the surface.
 *
 * `ExplorerSaveModal`/`saveExplorerObjects` (all-or-nothing, no per-object
 * gate) are DELETED — "Save to Project" now opens `ExplorationPromoteModal`,
 * the per-object checklist (01-ux-spec.md §3, 02-architecture.md §3).
 *
 * The promoted trail links each entry to its real, now-published object
 * (01 §3b) via `openWorkspaceTab`.
 *
 * OUTER CONTAINER: this component no longer owns its own width/border —
 * `RightRail` mounts it as the exploration scope's `Build` tab body inside
 * the shell's single, resizable right rail (`WorkspaceShell`'s
 * `workspaceRightWidth`/`DragHandle`), so the root element here just fills
 * whatever the rail gives it (`flex-1 min-h-0`), matching every other
 * `RightRailBody` branch (`RightRailEditPanel`, `OutlineTreePanel`, …).
 * `ExplorationWorkbench` (the exploration's CENTER pane — SQL editor,
 * results, chart preview) no longer mounts a sibling copy of this rail —
 * that in-pane mount was the two-rails bug (shell-ia #1, code-grounding
 * defect #1); this is the only place `ExplorationBuildRail` renders now.
 *
 * @param {object} props
 * @param {string} [props.explorationId] - the current exploration's backend
 *   id (threaded from `ExplorationPane` -> `RightRail`'s exploration
 *   `selectedItem`).
 */
const ExplorationBuildRail = ({ explorationId }) => {
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const activeInsightName = useStore(s => s.explorerActiveInsightName);
  const setActiveInsight = useStore(s => s.setActiveInsight);
  const createInsight = useStore(s => s.createInsight);
  const hasChanges = useStore(selectHasModifications);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const promotedRaw = useStore(s =>
    explorationId ? s.workspaceExplorations?.byId?.[explorationId]?.promoted || EMPTY_PROMOTED : EMPTY_PROMOTED
  );
  // D11 / ux-audit.md "PROMOTED ledger duplicates entries (query_1 · model
  // listed twice)": the backend record is an append-only log (each promote
  // run appends a fresh entry, even for an object saved before), so the
  // SAME object can legitimately appear more than once. The trail is a
  // status list ("what's in my project"), not a history — dedupe by
  // `type:name`, keeping the LAST (most recent) entry for each.
  const promoted = useMemo(() => {
    const byKey = new Map();
    promotedRaw.forEach(p => byKey.set(`${p.type}:${p.name}`, p));
    return Array.from(byKey.values());
  }, [promotedRaw]);

  const [chartExpanded, setChartExpanded] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // D11 (walkthrough finding, post-Wave-1): "Save to project" already
  // suggests a real name for a brand-new placeholder-named row
  // (`promoteNaming.js`'s `suggestPromoteNames`) — but only at save time, so
  // a chip sat on screen literally labeled "model"/"insight" for the whole
  // life of the draft up to that point (the single most visible copy issue
  // left in this phase). This mirrors that same suggestion live, the moment
  // a placeholder-named model tab has a source to anchor on (every fresh
  // tab gets one immediately — project default or first available source,
  // `createModelTab`) or a placeholder-named insight has a real model to
  // anchor on. `renameModelTab`/`renameInsight` already refuse to touch
  // anything that isn't a brand-new draft (their own `isNew` guard) and are
  // a no-op on a name that's already real, so this only ever fires once per
  // object — after the rename, the tab/insight name is no longer generic,
  // so the effect naturally stops re-firing for it. The one deliberate
  // tradeoff: a user who manually retypes a chip's name back to literally
  // "model"/"insight" would see it renamed again too — an accepted, narrow
  // edge case for keeping this simple and not tracking "did the user ever
  // touch this name" separately from the store's own isNew/name state.
  const explorerModelTabsForNaming = useStore(s => s.explorerModelTabs);
  const explorerModelStatesForNaming = useStore(s => s.explorerModelStates);
  const renameModelTab = useStore(s => s.renameModelTab);
  const renameInsight = useStore(s => s.renameInsight);
  useEffect(() => {
    const used = new Set(Array.from(getAllKnownNames(useStore.getState()).keys()));

    let modelAnchor = null;
    for (const name of explorerModelTabsForNaming) {
      if (!isGenericPromoteName('model', name)) {
        modelAnchor = name;
        continue;
      }
      const sourceName = explorerModelStatesForNaming?.[name]?.sourceName || null;
      if (!sourceName) continue; // no anchor yet — leave editable, never guess
      // No `suggested === name` short-circuit here: `suggested` is always of
      // the form `<sourceName>_query`(`_N`), which can never coincide with
      // `name` (already established above to be exactly `model` or
      // `query_<digits>`) — and `renameModelTab` already no-ops on an
      // identical name anyway, so there's nothing to guard twice.
      const suggested = generateUniqueName(`${sourceName}_query`, used);
      used.add(suggested);
      try {
        renameModelTab(name, suggested);
        modelAnchor = suggested;
      } catch {
        // A collision the suggestion logic couldn't see — fail open, leave
        // the placeholder in place; still editable by hand via the chip's
        // rename menu.
      }
    }

    for (const name of chartInsightNames) {
      if (!isGenericPromoteName('insight', name)) continue;
      if (!modelAnchor) continue; // no model to anchor on — leave editable
      // Same non-coincidence argument as the model loop above: `suggested`
      // is always `<modelAnchor>_insight`(`_N`), which can't equal `name`
      // (already `insight`/`insight_<digits>`) — `renameInsight` no-ops on
      // an identical name regardless.
      const suggested = generateUniqueName(`${modelAnchor}_insight`, used);
      used.add(suggested);
      try {
        renameInsight(name, suggested);
      } catch {
        // same fail-open as above
      }
    }
    // Deliberately excludes `chartInsightNames`'s own identity churn concerns
    // beyond re-running when it changes — this effect is idempotent and
    // self-terminating (see comment above), so re-running it on every
    // relevant state change is safe and cheap (no network calls).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    explorerModelTabsForNaming,
    explorerModelStatesForNaming,
    chartInsightNames,
    renameModelTab,
    renameInsight,
  ]);

  const handleOpenPromoted = useCallback(
    p => {
      openWorkspaceTab?.({ id: `${p.type}:${p.name}`, type: p.type, name: p.name });
    },
    [openWorkspaceTab]
  );

  const handleToggleInsight = useCallback(
    insightName => {
      if (activeInsightName === insightName) {
        setActiveInsight(null);
      } else {
        setActiveInsight(insightName);
      }
    },
    [activeInsightName, setActiveInsight]
  );

  const handleToggleChart = useCallback(() => {
    setChartExpanded(prev => !prev);
  }, []);

  const handleAddInsight = useCallback(() => {
    createInsight();
    recordOnboardingAction('insight_added');
  }, [createInsight]);

  return (
    <div
      data-testid="exploration-build-rail"
      className="flex flex-1 min-h-0 flex-col overflow-hidden bg-white"
    >
      {/* T4 (cold-start #3 / promote-roundtrip #3): opts this scroll body OUT
          of dnd-kit's built-in auto-scroll (see WorkspaceDndContext's
          `autoScroll.canScroll`) — auto-scrolling THIS container mid-drag is
          what moved x/y drop targets out from under the cursor. */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" data-dnd-freeze-scroll>
        <ChartBuildSection isExpanded={chartExpanded} onToggleExpand={handleToggleChart} />

        <div className="border-t-2 border-gray-200" />

        {chartInsightNames.map(name => (
          <InsightBuildSection
            key={name}
            insightName={name}
            isExpanded={name === activeInsightName}
            onToggleExpand={() => handleToggleInsight(name)}
          />
        ))}

        <button
          data-testid="right-panel-add-insight"
          data-onb-target="right-panel-add-insight"
          onClick={handleAddInsight}
          className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-md border border-dashed border-purple-300 transition-colors"
        >
          <PiPlus size={14} />
          Add Insight
        </button>

        {/* Saved-to-project trail (01-ux-spec.md §3b) — each entry links to
            its real, now-published object. D11: "promote" is internal-only
            vocabulary now — this heading and its caption use the single
            user-facing verb ("Save to project") and signpost the SECOND,
            separate step (global Commit) rather than leaving the user to
            infer it from an unexplained "Commit" button appearing in the
            nav (ux-audit.md "Save / Promote / Commit: three words, one
            journey, zero signposting"). */}
        <div data-testid="exploration-promoted-trail" className="border-t border-gray-100 pt-2">
          <label className="block text-xs font-medium text-gray-400 mb-0.5 uppercase tracking-wide">
            Saved to project
          </label>
          {promoted.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">
              Objects you save to project will appear here.
            </p>
          ) : (
            <>
              <p
                className="text-[10px] text-gray-400 mb-1"
                title="Saved objects are written to your project files but not committed yet — use Commit in the top bar to make them permanent."
              >
                pending commit
              </p>
              <ul className="space-y-1">
                {promoted.map(p => (
                  <li key={`${p.type}:${p.name}`}>
                    <button
                      type="button"
                      data-testid={`exploration-promoted-item-${p.type}-${p.name}`}
                      onClick={() => handleOpenPromoted(p)}
                      className="flex w-full items-center gap-1.5 text-xs text-gray-600 hover:text-primary-700 hover:underline text-left"
                    >
                      <PiCheckCircle size={12} className="text-green-500 flex-shrink-0" />
                      <span className="truncate">{p.name}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400">{p.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 p-3 border-t border-gray-200 bg-white">
        <button
          data-testid="explorer-save-button"
          data-onb-target="explorer-save-button"
          disabled={!hasChanges}
          onClick={() => setShowSaveModal(true)}
          className="flex items-center justify-center gap-2 w-full py-2 px-4 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PiFloppyDisk size={16} />
          Save to project…
        </button>
      </div>
      {showSaveModal && (
        <ExplorationPromoteModal
          explorationId={explorationId}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
};

export default ExplorationBuildRail;
