import React, { useState, useEffect, useCallback } from 'react';
import { PiCaretDown, PiCaretRight, PiPlus } from 'react-icons/pi';
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
  const chartName = useStore((s) => s.explorerChartName);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const setChartName = useStore((s) => s.setChartName);
  const replaceChartLayout = useStore((s) => s.replaceChartLayout);
  const createInsight = useStore((s) => s.createInsight);
  const removeInsightFromChart = useStore((s) => s.removeInsightFromChart);
  const setActiveInsight = useStore((s) => s.setActiveInsight);

  const [layoutSchema, setLayoutSchema] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSchema('layout').then((s) => {
      if (!cancelled) setLayoutSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNameChange = useCallback(
    (e) => {
      setChartName(e.target.value);
    },
    [setChartName]
  );

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

  return (
    <div
      data-testid="chart-crud-section"
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* Header */}
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

        <span className="text-sm font-medium text-pink-800 truncate flex-1">
          Chart: {chartName || 'Untitled'}
        </span>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-4 border-l-4 border-pink-400">
          {/* Chart Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              data-testid="chart-name-input"
              type="text"
              value={chartName || ''}
              onChange={handleNameChange}
              placeholder="Chart name..."
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:ring-2 focus:ring-pink-200 focus:border-pink-400 transition-colors"
            />
          </div>

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
