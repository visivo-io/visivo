import React, { useState, useCallback } from 'react';
import { PiPlus, PiFloppyDisk } from 'react-icons/pi';
import useStore from '../../stores/store';
import { selectHasModifications } from '../../stores/explorerNewStore';
import InsightCRUDSection from './InsightCRUDSection';
import ChartCRUDSection from './ChartCRUDSection';
import ExplorerSaveModal from './ExplorerSaveModal';

const ExplorerRightPanel = () => {
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const setActiveInsight = useStore((s) => s.setActiveInsight);
  const createInsight = useStore((s) => s.createInsight);
  const hasChanges = useStore(selectHasModifications);

  const [chartExpanded, setChartExpanded] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleToggleInsight = useCallback(
    (insightName) => {
      if (activeInsightName === insightName) {
        setActiveInsight(null);
      } else {
        setActiveInsight(insightName);
      }
    },
    [activeInsightName, setActiveInsight]
  );

  const handleToggleChart = useCallback(() => {
    setChartExpanded((prev) => !prev);
  }, []);

  const handleAddInsight = useCallback(() => {
    createInsight();
  }, [createInsight]);

  return (
    <div
      data-testid="explorer-right-panel"
      className="w-96 flex-shrink-0 border-l border-secondary-200 bg-white flex flex-col h-full overflow-hidden"
    >
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Chart Section (container — always at top) */}
        <ChartCRUDSection isExpanded={chartExpanded} onToggleExpand={handleToggleChart} />

        {/* Divider */}
        <div className="border-t-2 border-gray-200" />

        {/* Insight Sections (below chart — shows hierarchy) */}
        {chartInsightNames.map((name) => (
          <InsightCRUDSection
            key={name}
            insightName={name}
            isExpanded={name === activeInsightName}
            onToggleExpand={() => handleToggleInsight(name)}
          />
        ))}

        {/* Add Insight Button */}
        <button
          data-testid="right-panel-add-insight"
          onClick={handleAddInsight}
          className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-md border border-dashed border-purple-300 transition-colors"
        >
          <PiPlus size={14} />
          Add Insight
        </button>
      </div>

      {/* Save Button (fixed at bottom) */}
      <div className="flex-shrink-0 p-3 border-t border-gray-200 bg-white">
        <button
          data-testid="explorer-save-button"
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

export default ExplorerRightPanel;
