import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { PiPlus, PiFloppyDisk, PiCheckCircle, PiMagnifyingGlass, PiSparkle } from 'react-icons/pi';
import useStore from '../../../stores/store';
import {
  selectHasModifications,
  getAllKnownNames,
  computeChartHasContent,
  computeMeaningfulInsightNames,
} from '../../../stores/explorerStore';
import { generateUniqueName } from '../../../utils/uniqueName';
import { isGenericPromoteName } from './promoteNaming';
import InsightBuildSection from './InsightBuildSection';
import ChartBuildSection from './ChartBuildSection';
import ExplorationPromoteModal from './ExplorationPromoteModal';
import { recordOnboardingAction } from '../../onboarding/onboardingState';
import Dropdown from '../../common/Dropdown';
import { getTypeIcon } from '../common/objectTypeConfigs';

const InsightIcon = getTypeIcon('insight');

/**
 * AddInsightMenu — Phase 6c-T5 (ux-audit.md "'+ Add Insight' creates a blank
 * insight instead of letting you pick an existing one" finding). The picker
 * is primary (project insights not already on this chart, searchable); "New
 * blank insight" is a clearly-labeled secondary action, not the only option
 * a click on "+ Add Insight" ever produced.
 */
const AddInsightMenu = ({ onPickExisting, onCreateNew, close }) => {
  const allInsights = useStore(s => s.insights || []);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const [query, setQuery] = useState('');

  const pickable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allInsights
      .filter(i => !chartInsightNames.includes(i.name))
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allInsights, chartInsightNames, query]);

  return (
    <div data-testid="add-insight-menu" className="flex max-h-80 flex-col">
      <button
        type="button"
        data-testid="add-insight-menu-create-new"
        onClick={() => {
          onCreateNew();
          close();
        }}
        className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-xs font-medium text-purple-600 hover:bg-purple-50"
      >
        <PiSparkle size={14} />
        New blank insight
      </button>
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-1.5">
        <PiMagnifyingGlass size={12} className="shrink-0 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find an insight to add…"
          data-testid="add-insight-menu-search"
          className="w-full border-none bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {pickable.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">
            {allInsights.length === 0
              ? 'No other insights in this project yet.'
              : 'No matches — every other insight is already on this chart.'}
          </p>
        ) : (
          pickable.map(insight => (
            <button
              key={insight.name}
              type="button"
              data-testid={`add-insight-menu-existing-${insight.name}`}
              onClick={() => {
                onPickExisting(insight.name);
                close();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              {InsightIcon && <InsightIcon size={13} className="shrink-0 text-purple-500" />}
              <span className="truncate">{insight.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

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
  const addExistingInsightToChart = useStore(s => s.addExistingInsightToChart);
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
  //
  // VIS-1082 interaction (cold-session default-source race,
  // useExplorerWorkbenchInit.js): on a genuinely cold session, a model tab
  // can be auto-created with a TEMPORARY "first available source" fallback
  // before `defaults` has loaded; a dedicated effect there
  // (`applyResolvedDefaultSource`) rebinds it to the real project default
  // once `defaults` lands, looking the tab up BY ITS ORIGINAL NAME. An
  // earlier version of this effect had no dependency on `defaults` at all,
  // so it could rename that tab off the temporary fallback source (e.g.
  // `local-sqlite_query`) before the rebind ran — the rebind's name lookup
  // then silently missed (the tab no longer existed under its original
  // name) and the source correction was lost entirely, caught by
  // `explorer-cold-session-default-source.spec.mjs` failing after this
  // effect was introduced. Gating model-tab renaming on `defaults` having
  // already loaded closes the window: while `defaults` is still null, no
  // source-based rename fires at all, so the rebind's name lookup always
  // still finds the tab; once `defaults` loads and the rebind (if any)
  // corrects `sourceName`, THIS effect naturally re-fires (its own
  // `explorerModelStatesForNaming` dependency changes) and suggests off the
  // now-correct source. No new dependency-array entry is needed for
  // `defaults` itself — the rebind's `set()` call is what actually retriggers
  // this effect, by changing `explorerModelStatesForNaming`.
  const explorerModelTabsForNaming = useStore(s => s.explorerModelTabs);
  const explorerModelStatesForNaming = useStore(s => s.explorerModelStates);
  const explorerDefaultsForNaming = useStore(s => s.defaults);
  const renameModelTab = useStore(s => s.renameModelTab);
  const renameInsight = useStore(s => s.renameInsight);
  // VIS-1109 (ux-audit.md's D11 naming cascade never reached the LAST link):
  // the two loops below already carry a fresh query -> chart build through
  // `<source>_query` -> `<...>_insight` — the chart itself was the one step
  // of promoteNaming.js's own documented chain (`_query -> _insight ->
  // _chart`) this effect never took. `explorerChartName` stays `null`
  // ("Chart: Untitled" in the Build rail) even after the user binds real x/y
  // content, and `buildPromoteChecklist` gates the chart's entire checklist
  // row on `explorerChartName` being truthy — so a fully live, rendering
  // chart was silently dropped from "Save to project" with no row and no
  // notice. These three read the same "has real content" state
  // `buildPromoteChecklist` itself gates on (`computeChartHasContent`,
  // shared from `explorerStore.js` so the two can never drift apart) —
  // exactly so a chart referencing only scaffold insights, with no layout of
  // its own, stays unnamed and editable, same as an unbound model/insight
  // does above (VIS-1102's "never offer scaffolding" bar still holds).
  const explorerChartNameForNaming = useStore(s => s.explorerChartName);
  const explorerChartLayoutForNaming = useStore(s => s.explorerChartLayout);
  const explorerInsightStatesForNaming = useStore(s => s.explorerInsightStates);
  const setChartName = useStore(s => s.setChartName);
  useEffect(() => {
    const used = new Set(Array.from(getAllKnownNames(useStore.getState()).keys()));

    let modelAnchor = null;
    for (const name of explorerModelTabsForNaming) {
      if (!isGenericPromoteName('model', name)) {
        modelAnchor = name;
        continue;
      }
      // Defaults haven't loaded yet — this tab's `sourceName` may still be
      // the temporary "first available" fallback pending correction (see
      // the VIS-1082 note above). Leave it generic/editable rather than
      // naming it off a source that's about to change out from under it.
      if (!explorerDefaultsForNaming) continue;
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

    // VIS-1109 — the chart naming step promoteNaming.js's cascade always
    // documented but this effect never actually took. Only fires once the
    // chart is genuinely content-bearing (never for pure scaffolding — same
    // bar `buildPromoteChecklist` itself gates the chart row on) and only
    // while it's still unnamed; once named, `explorerChartNameForNaming`
    // flips truthy and this branch naturally stops re-firing, exactly like
    // the model/insight loops above.
    if (!explorerChartNameForNaming) {
      // Read fresh, post-rename state — the loops above may have just
      // renamed the very insight(s) this reads by name via `renameInsight`
      // (a synchronous `set()`), so `chartInsightNames`/
      // `explorerInsightStatesForNaming` captured at the top of this render
      // could still be the PRE-rename names.
      const freshState = useStore.getState();
      const meaningfulInsightNames = computeMeaningfulInsightNames(freshState);
      if (computeChartHasContent(freshState, meaningfulInsightNames)) {
        const insightAnchor =
          (freshState.explorerChartInsightNames || []).find(n => meaningfulInsightNames.has(n)) ||
          null;
        // Same cascade fallback `promoteNaming.js` uses at save time: anchor
        // on the meaningful insight if there is one, otherwise the model —
        // covers a chart made valid by real layout config alone (D12-style
        // "chart with a title but no insight bound yet").
        const base = insightAnchor
          ? `${insightAnchor}_chart`
          : modelAnchor
            ? `${modelAnchor}_chart`
            : null;
        // No usable anchor at all (no model loaded either) — leave it
        // unnamed/editable rather than guessing, same as the loops above.
        if (base) {
          const suggested = generateUniqueName(base, used);
          used.add(suggested);
          try {
            setChartName(suggested);
          } catch {
            // A collision the suggestion logic couldn't see — fail open,
            // leave the chart unnamed; still editable by hand via
            // `ChartBuildSection`'s own rename input.
          }
        }
      }
    }
    // Deliberately excludes `chartInsightNames`'s own identity churn concerns
    // beyond re-running when it changes — this effect is idempotent and
    // self-terminating (see comment above), so re-running it on every
    // relevant state change is safe and cheap (no network calls).
    // `explorerDefaultsForNaming` IS listed below even though the common
    // path (a rebind actually correcting `sourceName`) would re-trigger this
    // effect via `explorerModelStatesForNaming` alone — the fallback source
    // can coincidentally already equal the real default (single-source
    // projects; `applyResolvedDefaultSource` itself no-ops when they match),
    // in which case `explorerModelStatesForNaming` never changes once
    // `defaults` arrives, and without `defaults` as its own dependency this
    // effect would never re-run to notice it's now safe to suggest a name.
    // `explorerChartNameForNaming`/`explorerChartLayoutForNaming`/
    // `explorerInsightStatesForNaming`/`setChartName` (VIS-1109) follow the
    // exact same reasoning as the model/insight dependencies above: the
    // chart-naming branch needs to re-run whenever any of them changes (a
    // prop gets bound, layout gets edited, the chart gets named/renamed) to
    // notice newly-arrived content or to stop once a real name is in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    explorerModelTabsForNaming,
    explorerModelStatesForNaming,
    explorerDefaultsForNaming,
    chartInsightNames,
    renameModelTab,
    renameInsight,
    explorerChartNameForNaming,
    explorerChartLayoutForNaming,
    explorerInsightStatesForNaming,
    setChartName,
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

  const handleCreateNewInsight = useCallback(() => {
    createInsight();
    recordOnboardingAction('insight_added');
  }, [createInsight]);

  // Phase 6c-T5 (ux-audit.md "'+ Add Insight' creates a blank insight
  // instead of letting you pick an existing one" finding): reuses the SAME
  // pull-in logic the Library's "Add to exploration" context action and
  // drag-and-drop already go through — an existing insight added this way
  // brings its referenced models along automatically.
  const handlePickExistingInsight = useCallback(
    insightName => {
      addExistingInsightToChart?.(insightName);
      recordOnboardingAction('insight_added');
    },
    [addExistingInsightToChart]
  );

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

        <Dropdown
          width={260}
          trigger={
            <button
              type="button"
              data-testid="right-panel-add-insight"
              data-onb-target="right-panel-add-insight"
              className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-md border border-dashed border-purple-300 transition-colors"
            >
              <PiPlus size={14} />
              Add Insight
            </button>
          }
        >
          {close => (
            <AddInsightMenu
              onPickExisting={handlePickExistingInsight}
              onCreateNew={handleCreateNewInsight}
              close={close}
            />
          )}
        </Dropdown>

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
