import React, { useState, useCallback } from 'react';
import { PiPlus, PiFloppyDisk, PiCheckCircle } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { selectHasModifications } from '../../../stores/explorerStore';
import InsightBuildSection from './InsightBuildSection';
import ChartBuildSection from './ChartBuildSection';
import ExplorerSaveModal from '../../explorer/ExplorerSaveModal';
import { recordOnboardingAction } from '../../onboarding/onboardingState';

// A single stable reference for the "no promoted entries" case — a fresh `[]`
// literal returned from a Zustand selector on every render breaks the
// store's reference-equality check and infinite-loops the subscription.
const EMPTY_PROMOTED = [];

/**
 * ExplorationBuildRail — Explore 2.0 Phase 3b (VIS-1059, 03-delivery-plan.md
 * Phase 3b: "RightRail exploration Build branch... rebuilt onto
 * TracePropsEditor/FieldGroupList"). Replaces `ExplorerRightPanel` for the
 * exploration surface — same overall composition (Chart section always on
 * top, stacked Insight sections below, Add Insight, Save to Project) but the
 * CRUD sections are rebuilt onto `TracePropsEditor`/`FieldGroupList`
 * (`InsightBuildSection`/`ChartBuildSection`) instead of `SchemaEditor`.
 *
 * `ExplorerSaveModal`/`saveExplorerObjects` are UNCHANGED — 03's delivery
 * plan keeps them until Phase 4's promote-gate rebuild; this rail keeps the
 * exact "Save to Project" button + modal the legacy right panel used.
 *
 * The promoted-trail section is a Phase 4 PLACEHOLDER (03's Phase 3b scope:
 * "+ the promoted trail" as a rail section, not a working deep-link flow —
 * that arrives with the promote gate). It reads the exploration's real
 * `promoted[]` list (empty until Phase 4 exists) so the section becomes
 * live automatically once promoting is wired up, with no further changes to
 * this component.
 *
 * @param {object} props
 * @param {string} [props.explorationId] - the current exploration's backend
 *   id (threaded from `ExplorationPane` -> `ExplorationWorkbench`), used only
 *   to read the promoted-trail placeholder's `promoted[]` list.
 */
const ExplorationBuildRail = ({ explorationId }) => {
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const activeInsightName = useStore(s => s.explorerActiveInsightName);
  const setActiveInsight = useStore(s => s.setActiveInsight);
  const createInsight = useStore(s => s.createInsight);
  const hasChanges = useStore(selectHasModifications);
  const promoted = useStore(s =>
    explorationId ? s.workspaceExplorations?.byId?.[explorationId]?.promoted || EMPTY_PROMOTED : EMPTY_PROMOTED
  );

  const [chartExpanded, setChartExpanded] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);

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
      className="w-96 flex-shrink-0 border-l border-secondary-200 bg-white flex flex-col h-full overflow-hidden"
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

        {/* Promoted trail (Phase 4 placeholder — 01-ux-spec.md §3's "promoted
            count arrives in Phase 4" note). Renders real entries once
            promote is wired up; today `promoted` is always empty. */}
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
                <li
                  key={`${p.type}:${p.name}:${i}`}
                  data-testid={`exploration-promoted-item-${p.type}-${p.name}`}
                  className="flex items-center gap-1.5 text-xs text-gray-600"
                >
                  <PiCheckCircle size={12} className="text-green-500 flex-shrink-0" />
                  <span className="truncate">{p.name}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-400">{p.type}</span>
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
      {showSaveModal && <ExplorerSaveModal onClose={() => setShowSaveModal(false)} />}
    </div>
  );
};

export default ExplorationBuildRail;
