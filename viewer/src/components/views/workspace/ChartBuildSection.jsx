import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PiCaretDown, PiCaretRight, PiPlus, PiX } from 'react-icons/pi';
import { useDroppable } from '@dnd-kit/core';
import EmbeddedPill from '../lineage/EmbeddedPill';
import useStore from '../../../stores/store';
import { selectInsightStatus } from '../../../stores/explorerStore';
import { getSchema } from '../../../schemas/schemas';
import { SchemaEditor } from '../common/SchemaEditor/SchemaEditor';
import { recordOnboardingAction } from '../../onboarding/onboardingState';

const InsightPillItem = ({ name, isActive, onRemove, onClick }) => {
  const status = useStore(selectInsightStatus(name));
  return (
    <span data-testid={`chart-insight-pill-${name}`}>
      <EmbeddedPill
        objectType="insight"
        label={name}
        isActive={isActive}
        onClick={onClick}
        onRemove={onRemove}
        statusDot={status}
      />
    </span>
  );
};

/**
 * ChartBuildSection — Explore 2.0 Phase 3b (VIS-1059). Replaces
 * `ChartCRUDSection` on the exploration Build rail. Behaviorally identical
 * to the retired component (chart name/rename, insight list + drop zone,
 * Layout Properties) — this section's own body has no ref-valued/pillable
 * slots (chart Layout properties are static Plotly layout knobs, not query
 * expressions), so it stays on `SchemaEditor` with `droppable={false}`
 * exactly as before; the D8/D10 pill + `property-zone` DnD rebuild's target
 * is `InsightBuildSection`'s per-insight props, not this section.
 */
const ChartBuildSection = ({ isExpanded, onToggleExpand }) => {
  const isLoadedChart = useStore(s => (s.charts || []).some(c => c.name === s.explorerChartName));
  const chartName = useStore(s => s.explorerChartName);
  const chartLayout = useStore(s => s.explorerChartLayout);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const activeInsightName = useStore(s => s.explorerActiveInsightName);
  const setChartName = useStore(s => s.setChartName);
  const replaceChartLayout = useStore(s => s.replaceChartLayout);
  const createInsight = useStore(s => s.createInsight);
  const removeInsightFromChart = useStore(s => s.removeInsightFromChart);
  const setActiveInsight = useStore(s => s.setActiveInsight);
  const closeChart = useStore(s => s.closeChart);

  const [layoutSchema, setLayoutSchema] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const skipNextCommitRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setRenameValue(chartName || 'Untitled');
      setRenameError(null);
    }
  }, [chartName, isEditing]);

  const { setNodeRef: setInsightDropRef, isOver: isInsightOver } = useDroppable({
    id: 'chart-insight-zone',
    data: { type: 'insight-zone' },
  });

  useEffect(() => {
    let cancelled = false;
    getSchema('layout').then(s => {
      if (!cancelled) setLayoutSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLayoutChange = useCallback(
    newValue => {
      if (!newValue || typeof newValue !== 'object') return;
      replaceChartLayout(newValue);
    },
    [replaceChartLayout]
  );

  const handleAddInsight = useCallback(() => {
    createInsight();
    recordOnboardingAction('insight_added');
  }, [createInsight]);

  const handleRemoveInsight = useCallback(
    (e, name) => {
      e.stopPropagation();
      removeInsightFromChart(name);
    },
    [removeInsightFromChart]
  );

  const handleInsightClick = useCallback(
    name => {
      setActiveInsight(name);
    },
    [setActiveInsight]
  );

  const handleToggle = useCallback(
    e => {
      e.stopPropagation();
      onToggleExpand();
    },
    [onToggleExpand]
  );

  const handleClose = useCallback(
    e => {
      e.stopPropagation();
      closeChart?.();
    },
    [closeChart]
  );

  const commitRename = useCallback(() => {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    setIsEditing(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === (chartName || 'Untitled') || trimmed === 'Untitled') {
      setRenameError(null);
      setRenameValue(chartName || 'Untitled');
      return;
    }
    try {
      setChartName(trimmed);
      setRenameError(null);
    } catch (err) {
      if (err?.code === 'NAME_COLLISION') {
        setRenameError(err.message);
        setIsEditing(true);
        return;
      }
      throw err;
    }
  }, [renameValue, chartName, setChartName]);

  return (
    <div
      data-testid="chart-build-section"
      data-onb-target="chart-crud-section"
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      <div
        data-testid="chart-header"
        onClick={onToggleExpand}
        className="flex items-center gap-2 px-3 py-2 bg-pink-50/50 border-l-4 border-pink-400 cursor-pointer hover:bg-pink-50 transition-colors duration-150"
      >
        <button
          data-testid="chart-toggle"
          onClick={handleToggle}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? <PiCaretDown size={14} /> : <PiCaretRight size={14} />}
        </button>

        <span className="text-sm text-pink-600 flex-shrink-0">{'Chart: '}</span>

        <span className="flex-1 flex flex-col">
          <input
            data-testid="chart-name-input"
            value={renameValue}
            disabled={isLoadedChart}
            onFocus={() => setIsEditing(true)}
            onChange={e => {
              setRenameValue(e.target.value);
              if (renameError) setRenameError(null);
            }}
            onBlur={() => commitRename()}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') {
                skipNextCommitRef.current = true;
                setRenameError(null);
                setRenameValue(chartName || 'Untitled');
                setIsEditing(false);
                e.target.blur();
              }
            }}
            onClick={e => e.stopPropagation()}
            className={`text-sm font-medium text-pink-800 bg-transparent border-0 border-b border-transparent px-0 py-0 outline-none focus:border-pink-400 disabled:cursor-default ${
              renameError ? 'border-highlight-400 focus:border-highlight-400' : ''
            }`}
          />
          {renameError && (
            <span data-testid="chart-rename-error" className="text-xs text-highlight-600 mt-0.5">
              {renameError}
            </span>
          )}
        </span>

        <button
          data-testid="chart-close"
          onClick={handleClose}
          className="flex-shrink-0 text-gray-400 hover:text-highlight-500 transition-colors"
          title="Close chart"
        >
          <PiX size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 py-3 space-y-4 border-l-4 border-pink-400">
          <div
            ref={setInsightDropRef}
            data-testid="chart-insight-drop-zone"
            className={`rounded p-2 transition-all ${
              isInsightOver ? 'ring-2 ring-pink-400 ring-offset-1 bg-pink-50/50' : ''
            }`}
          >
            <label className="block text-xs font-medium text-gray-600 mb-1">Insights</label>
            {chartInsightNames.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                No insights added yet. Drag from the Library or click below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {chartInsightNames.map(name => (
                  <InsightPillItem
                    key={name}
                    name={name}
                    isActive={name === activeInsightName}
                    onClick={() => handleInsightClick(name)}
                    onRemove={e => handleRemoveInsight(e, name)}
                  />
                ))}
              </div>
            )}
            <button
              data-testid="chart-add-insight"
              onClick={handleAddInsight}
              className="flex items-center gap-1 mt-2 text-xs text-pink-600 hover:text-pink-800 transition-colors"
            >
              <PiPlus size={12} />
              Add Insight
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Layout Properties</label>
            <SchemaEditor
              schema={layoutSchema}
              value={chartLayout}
              onChange={handleLayoutChange}
              excludeProperties={[]}
              initiallyExpanded={Object.keys(chartLayout || {})}
              droppable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartBuildSection;
