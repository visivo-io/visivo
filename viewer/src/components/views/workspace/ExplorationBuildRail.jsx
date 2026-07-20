import React, { useState, useCallback } from 'react';
import { PiPlus, PiFloppyDisk, PiCheckCircle } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { selectHasModifications } from '../../../stores/explorerStore';
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
  const promoted = useStore(s =>
    explorationId ? s.workspaceExplorations?.byId?.[explorationId]?.promoted || EMPTY_PROMOTED : EMPTY_PROMOTED
  );

  const [chartExpanded, setChartExpanded] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);

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
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
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

        {/* Promoted trail (01-ux-spec.md §3b) — each entry links to its real,
            now-published object. */}
        <div data-testid="exploration-promoted-trail" className="border-t border-gray-100 pt-2">
          <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">
            Promoted
          </label>
          {promoted.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">
              Objects you Save to Project will appear here.
            </p>
          ) : (
            <ul className="space-y-1">
              {promoted.map((p, i) => (
                <li key={`${p.type}:${p.name}:${i}`}>
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
          Save to Project
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
