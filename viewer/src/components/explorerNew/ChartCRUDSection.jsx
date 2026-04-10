import React, { useState, useEffect, useCallback } from 'react';
import { PiCaretDown, PiCaretRight, PiPlus, PiX } from 'react-icons/pi';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';
import useStore from '../../stores/store';
import { selectInsightStatus } from '../../stores/explorerNewStore';
import { getSchema } from '../../schemas/schemas';
import { SchemaEditor } from '../new-views/common/SchemaEditor/SchemaEditor';

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

const ChartCRUDSection = ({ isExpanded, onToggleExpand }) => {
  const isLoadedChart = useStore((s) => (s.charts || []).some((c) => c.name === s.explorerChartName));
  const chartName = useStore((s) => s.explorerChartName);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const setChartName = useStore((s) => s.setChartName);
  const replaceChartLayout = useStore((s) => s.replaceChartLayout);
  const createInsight = useStore((s) => s.createInsight);
  const removeInsightFromChart = useStore((s) => s.removeInsightFromChart);
  const setActiveInsight = useStore((s) => s.setActiveInsight);
  const closeChart = useStore((s) => s.closeChart);

  const [layoutSchema, setLayoutSchema] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSchema('layout').then((s) => {
      if (!cancelled) setLayoutSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLayoutChange = useCallback(
    (newValue) => {
      if (!newValue || typeof newValue !== 'object') return;
      replaceChartLayout(newValue);
    },
    [replaceChartLayout]
  );

  const handleAddInsight = useCallback(() => {
    createInsight();
  }, [createInsight]);

  const handleRemoveInsight = useCallback(
    (e, name) => {
      e.stopPropagation();
      removeInsightFromChart(name);
    },
    [removeInsightFromChart]
  );

  const handleInsightClick = useCallback(
    (name) => {
      setActiveInsight(name);
    },
    [setActiveInsight]
  );

  const handleToggle = useCallback(
    (e) => {
      e.stopPropagation();
      onToggleExpand();
    },
    [onToggleExpand]
  );

  const handleClose = useCallback(
    (e) => {
      e.stopPropagation();
      closeChart?.();
    },
    [closeChart]
  );

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== chartName) {
      setChartName(trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, chartName, setChartName]);

  return (
    <div
      data-testid="chart-crud-section"
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* Header — name integrated, matching insight pattern */}
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

        <span className="text-sm text-pink-600 flex-shrink-0">Chart:</span>

        {isRenaming ? (
          <input
            autoFocus
            data-testid="chart-name-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium text-pink-800 bg-white border border-pink-300 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-pink-400 flex-1"
          />
        ) : (
          <span
            className={`text-sm font-medium text-pink-800 truncate flex-1 ${!isLoadedChart ? 'cursor-pointer' : ''}`}
            data-testid="chart-name-input"
            onClick={(e) => {
              if (!isLoadedChart) {
                e.stopPropagation();
                setIsRenaming(true);
                setRenameValue(chartName || '');
              }
            }}
          >
            {chartName || 'Untitled'}
          </span>
        )}

        <button
          data-testid="chart-close"
          onClick={handleClose}
          className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
          title="Close chart"
        >
          <PiX size={14} />
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-4 border-l-4 border-pink-400">
          {/* Insight List */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Insights</label>
            {chartInsightNames.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No insights added yet</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {chartInsightNames.map((name) => (
                  <InsightPillItem
                    key={name}
                    name={name}
                    isActive={name === activeInsightName}
                    onClick={() => handleInsightClick(name)}
                    onRemove={(e) => handleRemoveInsight(e, name)}
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

          {/* Layout Properties */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Layout Properties
            </label>
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

export default ChartCRUDSection;
